#!/usr/bin/env node
/**
 * Builds src/data/agency-catalog.json from the agent markdown files in
 * data/agency/<division>/*.md (source: github.com/msitarzewski/agency-agents).
 *
 * Each agent file carries YAML frontmatter:
 *   name / description / color / emoji / vibe
 *
 * The catalog stores ONLY metadata (small enough to ship to the client).
 * Full persona prompts are read from disk at runtime by src/lib/agency.ts.
 *
 * Run: bun scripts/build-agency-catalog.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const AGENCY_DIR = join(ROOT, 'data', 'agency')
const OUT_FILE = join(ROOT, 'src', 'data', 'agency-catalog.json')

/** Division metadata — mirrors upstream divisions.json (label, Lucide icon, brand color). */
const DIVISIONS = {
  academic: { label: 'Academic', icon: 'GraduationCap', color: '#8B5CF6' },
  design: { label: 'Design', icon: 'PenTool', color: '#EC4899' },
  engineering: { label: 'Engineering', icon: 'Code', color: '#3B82F6' },
  finance: { label: 'Finance', icon: 'DollarSign', color: '#22C55E' },
  'game-development': { label: 'Game Development', icon: 'Gamepad2', color: '#A855F7' },
  gis: { label: 'GIS', icon: 'Map', color: '#14B8A6' },
  healthcare: { label: 'Healthcare', icon: 'Stethoscope', color: '#0D9488' },
  marketing: { label: 'Marketing', icon: 'Megaphone', color: '#F97316' },
  'paid-media': { label: 'Paid Media', icon: 'Target', color: '#EAB308' },
  product: { label: 'Product', icon: 'Box', color: '#D946EF' },
  'project-management': { label: 'Project Management', icon: 'ClipboardList', color: '#0EA5E9' },
  sales: { label: 'Sales', icon: 'TrendingUp', color: '#10B981' },
  security: { label: 'Security', icon: 'ShieldCheck', color: '#EF4444' },
  'spatial-computing': { label: 'Spatial Computing', icon: 'Boxes', color: '#06B6D4' },
  specialized: { label: 'Specialized', icon: 'Sparkles', color: '#6366F1' },
  support: { label: 'Support', icon: 'LifeBuoy', color: '#84CC16' },
  testing: { label: 'Testing', icon: 'FlaskConical', color: '#F59E0B' },
}

/** Parse the YAML frontmatter block (simple key: value — no nested structures upstream). */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const fm = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (kv) fm[kv[1].trim()] = kv[2].trim()
  }
  return fm
}

const agents = []
const divisions = []
const seenSlugs = new Set()

for (const [divId, meta] of Object.entries(DIVISIONS)) {
  const dir = join(AGENCY_DIR, divId)
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  } catch {
    console.warn(`[agency-catalog] missing division dir: ${divId}`)
    continue
  }

  for (const file of files) {
    const slug = basename(file, '.md')
    if (seenSlugs.has(slug)) throw new Error(`duplicate slug: ${slug}`)
    seenSlugs.add(slug)

    const fm = parseFrontmatter(readFileSync(join(dir, file), 'utf8')) || {}
    const name = fm.name || slug
    const description = (fm.description || '').slice(0, 400)
    agents.push({
      slug,
      name,
      division: divId,
      description,
      emoji: fm.emoji || '🤖',
      vibe: (fm.vibe || '').slice(0, 200),
    })
  }

  divisions.push({ id: divId, ...meta, count: files.length })
}

const catalog = {
  generatedAt: new Date().toISOString(),
  stats: { agents: agents.length, divisions: divisions.length },
  divisions,
  agents,
}

mkdirSync(join(ROOT, 'src', 'data'), { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify(catalog, null, 0)) // 0 = minified (client payload)
writeFileSync(OUT_FILE.replace(/\.json$/, '.pretty.json'), JSON.stringify(catalog, null, 2))

console.log(`[agency-catalog] ${agents.length} agents across ${divisions.length} divisions → ${OUT_FILE}`)
for (const d of divisions) console.log(`  ${d.label.padEnd(20)} ${String(d.count).padStart(3)}  ${d.color}`)
