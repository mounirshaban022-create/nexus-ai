import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

/**
 * PDF text extraction utility — shared by /api/documents and /api/office/read.
 *
 * Implements a 3-layer fallback in ONE place so every PDF-upload route gets the
 * same resilient pipeline:
 *
 *   Layer 1 (primary):  `pdftotext -layout <tmpfile> -` via poppler CLI.
 *                       Fast, battle-tested, handles all text-based PDFs.
 *                       Also calls `pdfinfo` (best-effort) for a page count.
 *   Layer 2 (fallback): `pdf-parse` v2 (`new PDFParse({ data }).getText()`).
 *                       Pure-JS, recovers text from some PDFs poppler can't.
 *                       NOTE: pdf-parse v2.x has NO default export — the old
 *                       `(await import('pdf-parse')).default` returns
 *                       `undefined` and crashes. Use the named `PDFParse`
 *                       export and the `data` LoadParameter.
 *   Layer 3 (fallback): `pdftoppm` -> `tesseract` OCR for scanned PDFs
 *                       (renders up to 3 pages to PNG, OCRs each, concatenates).
 *
 * Each layer is wrapped in a 30s overall timeout via Promise.race against a
 * setTimeout, so a hung subprocess cannot block the request forever. If all
 * three layers yield empty text, a clear actionable Error is thrown.
 */

const execFileAsync = promisify(execFile)
const LAYER_TIMEOUT_MS = 30_000

/** Wrap a promise with a hard timeout. Rejects with `${label} timed out`. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** Random temp-file suffix so parallel calls don't collide. */
function randSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Layer 1 — `pdftotext` (poppler). Writes the buffer to a temp file first,
 * shells out to poppler, captures stdout. As a best-effort bonus, also runs
 * `pdfinfo` on the same temp file to extract a page count.
 */
async function layer1Pdftotext(
  buffer: Buffer
): Promise<{ text: string; pages?: number }> {
  const tmpPath = path.join(tmpdir(), `nexus-pdf-${randSuffix()}.pdf`)
  await writeFile(tmpPath, buffer)
  try {
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-layout', tmpPath, '-'],
      { timeout: LAYER_TIMEOUT_MS }
    )
    let pages: number | undefined
    try {
      const { stdout: info } = await execFileAsync('pdfinfo', [tmpPath], {
        timeout: LAYER_TIMEOUT_MS,
      })
      const m = info.match(/Pages:\s+(\d+)/)
      if (m) pages = parseInt(m[1], 10)
    } catch {
      /* pdfinfo is best-effort; ignore failures */
    }
    return { text: stdout ?? '', pages }
  } finally {
    unlink(tmpPath).catch(() => {})
  }
}

/**
 * Layer 2 — `pdf-parse` v2 (corrected API). v2.x ships its own types and
 * exposes `PDFParse` as a NAMED export (no default export). The constructor
 * takes a `LoadParameters` object whose `data` field accepts a TypedArray.
 * `getText()` resolves to a `TextResult` with `.text` (concatenated document
 * string) and `.total` (total page count).
 */
async function layer2PdfParse(
  buffer: Buffer
): Promise<{ text: string; pages?: number }> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    const text = (result?.text ?? '').toString()
    const pages = typeof result?.total === 'number' ? result.total : undefined
    return { text, pages }
  } finally {
    try {
      await parser.destroy()
    } catch {
      /* parser cleanup is best-effort */
    }
  }
}

/**
 * Layer 3 — OCR for scanned/image-only PDFs. Renders up to 3 pages to PNG
 * via `pdftoppm`, then runs `tesseract` on each page, concatenating results.
 */
async function layer3Ocr(
  buffer: Buffer
): Promise<{ text: string; pages?: number }> {
  const imgDir = tmpdir()
  const baseName = `nexus-pdf-ocr-${randSuffix()}`
  const pdfTmp = path.join(imgDir, `${baseName}.pdf`)
  const pngPrefix = path.join(imgDir, baseName)
  await writeFile(pdfTmp, buffer)
  try {
    await execFileAsync(
      'pdftoppm',
      ['-png', '-r', '200', '-l', '3', pdfTmp, pngPrefix],
      { timeout: LAYER_TIMEOUT_MS }
    )
    const files = (await readdir(imgDir))
      .filter((f) => f.startsWith(baseName) && f.endsWith('.png'))
      .sort()
    let ocrText = ''
    for (const f of files.slice(0, 3)) {
      const pagePath = path.join(imgDir, f)
      try {
        const { stdout } = await execFileAsync(
          'tesseract',
          [pagePath, '-', '-l', 'eng'],
          { timeout: LAYER_TIMEOUT_MS }
        )
        ocrText += stdout + '\n\n'
      } catch {
        /* individual page OCR failure — skip this page */
      } finally {
        unlink(pagePath).catch(() => {})
      }
    }
    return { text: ocrText, pages: files.length || undefined }
  } finally {
    unlink(pdfTmp).catch(() => {})
  }
}

/**
 * Extract text (and optional page count) from a PDF buffer using the
 * 3-layer fallback pipeline. Throws a clear, user-facing Error if no layer
 * yields any text.
 */
export async function extractPdfText(
  buffer: Buffer
): Promise<{ text: string; pages?: number }> {
  let text = ''
  let pages: number | undefined

  // Layer 1 — pdftotext (poppler)
  try {
    const r = await withTimeout(
      layer1Pdftotext(buffer),
      LAYER_TIMEOUT_MS,
      'pdftotext'
    )
    if (r.text.trim()) {
      text = r.text
      pages = r.pages
    }
  } catch (e) {
    console.warn(
      '[pdf-text] layer 1 (pdftotext) failed:',
      e instanceof Error ? e.message : e
    )
  }

  // Layer 2 — pdf-parse v2 (corrected named export)
  if (!text.trim()) {
    try {
      const r = await withTimeout(
        layer2PdfParse(buffer),
        LAYER_TIMEOUT_MS,
        'pdf-parse'
      )
      if (r.text.trim()) {
        text = r.text
        if (r.pages) pages = r.pages
      }
    } catch (e) {
      console.warn(
        '[pdf-text] layer 2 (pdf-parse) failed:',
        e instanceof Error ? e.message : e
      )
    }
  }

  // Layer 3 — OCR (scanned PDFs)
  if (!text.trim()) {
    try {
      const r = await withTimeout(
        layer3Ocr(buffer),
        LAYER_TIMEOUT_MS,
        'ocr'
      )
      if (r.text.trim()) {
        text = r.text
        if (r.pages) pages = r.pages
      }
    } catch (e) {
      console.warn(
        '[pdf-text] layer 3 (OCR) failed:',
        e instanceof Error ? e.message : e
      )
    }
  }

  if (!text.trim()) {
    throw new Error(
      'No text could be extracted from this PDF. It may be a scanned image or password-protected.'
    )
  }

  return { text, pages }
}
