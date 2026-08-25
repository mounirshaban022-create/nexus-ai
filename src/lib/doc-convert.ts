import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

/**
 * Document conversion via LibreOffice (headless) — converts legacy binary
 * Office formats (.doc/.xls/.ppt) and anything else LibreOffice understands
 * into the modern zip-based formats the chat attachment parser accepts.
 *
 * Used by the /api/chat attachment path so users can drop ANY document type
 * (Word, PDF, Excel, PowerPoint — old or new) into the chat and the AI can
 * read, edit and enhance it.
 */

const execFileAsync = promisify(execFile)
const CONVERT_TIMEOUT_MS = 45_000

export interface ConvertedDocument {
  dataUrl: string
  filename: string
}

/**
 * Convert an attached file to a target format (e.g. 'docx', 'xlsx', 'pptx').
 * Returns null when conversion is impossible (LibreOffice missing/failed) —
 * callers fall back to parsing the original.
 */
export async function convertWithLibreOffice(
  dataUrl: string,
  filename: string,
  targetFormat: string
): Promise<ConvertedDocument | null> {
  const base64 = dataUrl.includes(',') && dataUrl.startsWith('data:')
    ? dataUrl.split(',')[1]
    : dataUrl
  if (!base64) return null

  const dir = await mkdtemp(path.join(tmpdir(), 'nexus-convert-'))
  try {
    const inPath = path.join(dir, `in${path.extname(filename) || '.bin'}`)
    await writeFile(inPath, Buffer.from(base64, 'base64'))

    // soffice needs a writable HOME for its profile; use the temp dir.
    await execFileAsync(
      'soffice',
      ['--headless', '--norestore', '--convert-to', targetFormat, '--outdir', dir, inPath],
      { timeout: CONVERT_TIMEOUT_MS, env: { ...process.env, HOME: dir } }
    )

    const outPath = path.join(dir, `in.${targetFormat}`)
    const outBuffer = await readFile(outPath)
    if (outBuffer.length === 0) return null

    const mimeByFormat: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      pdf: 'application/pdf',
      txt: 'text/plain',
    }
    const mime = mimeByFormat[targetFormat] ?? 'application/octet-stream'
    const stem = filename.replace(/\.[^.]+$/, '')
    return {
      dataUrl: `data:${mime};base64,${outBuffer.toString('base64')}`,
      filename: `${stem}.${targetFormat}`,
    }
  } catch {
    return null
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
