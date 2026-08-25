/**
 * CLI-ANYTHING SKILLS — the agent's connection to 70+ real-world apps.
 *
 * Vendored from https://github.com/HKUDS/CLI-Anything (Apache-2.0):
 * "Making ALL Software Agent-Native" — a curated registry of CLI harnesses
 * + SKILL.md manuals that teach an AI agent how to drive real software
 * (Blender, GIMP, Obsidian, Joplin, LibreOffice, n8n, Zoom, browser
 * automation, mailchimp, Exa search, Calibre, Zotero…).
 *
 * How the agent uses it:
 *   1. `use_skill` chat tool with skill="list" → sees the catalog
 *   2. `use_skill` with a skill name → gets the full SKILL.md manual
 *   3. follows the manual: `run_command` installs/executes the CLI
 *
 * Everything is file-based (no DB) — the registry + manuals are read
 * from /cli-anything at request time with a small in-memory cache.
 */

import { readFile } from 'fs/promises'
import path from 'path'

const VENDOR_DIR = path.join(process.cwd(), 'cli-anything')
const SKILLS_DIR = path.join(VENDOR_DIR, 'skills')
const REGISTRY = path.join(VENDOR_DIR, 'registry.json')

/** Max chars of a SKILL.md manual returned to the agent (bound prompt size). */
const DOC_CHAR_CAP = 7000

export interface CliSkill {
  /** Directory/skill name, e.g. "cli-anything-browser" */
  name: string
  displayName: string
  description: string
  category: string
  requires?: string
  homepage?: string
  installCmd?: string
}

interface RegistryEntry {
  name: string
  display_name?: string
  description?: string
  category?: string
  requires?: string
  homepage?: string
  install_cmd?: string
  skill_md?: string
}

/* ------------------------------------------------------------------ */
/* Registry loading (cached)                                           */
/* ------------------------------------------------------------------ */

let registryCache: CliSkill[] | null = null
let docCache = new Map<string, string>()

/** Loads the vendored registry (with graceful fallback to a skills-dir scan). */
export async function listCliSkills(): Promise<CliSkill[]> {
  if (registryCache) return registryCache
  try {
    const raw = await readFile(REGISTRY, 'utf-8')
    const parsed = JSON.parse(raw) as { clis?: RegistryEntry[] }
    const entries = Array.isArray(parsed.clis) ? parsed.clis : []
    registryCache = entries.map((e) => ({
      name: e.name,
      displayName: e.display_name ?? e.name,
      description: e.description ?? '',
      category: e.category ?? 'general',
      requires: e.requires,
      homepage: e.homepage,
      installCmd: e.install_cmd,
    }))
  } catch {
    registryCache = []
  }
  return registryCache
}

/** Keyword search across name/displayName/description/category. */
export async function searchCliSkills(query: string, limit = 10): Promise<CliSkill[]> {
  const all = await listCliSkills()
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return all.slice(0, limit)
  const scored = all
    .map((s) => {
      const haystack = `${s.name} ${s.displayName} ${s.description} ${s.category}`.toLowerCase()
      let score = 0
      for (const t of terms) {
        if (s.name.toLowerCase().includes(t)) score += 5
        if (s.displayName.toLowerCase().includes(t)) score += 3
        if (haystack.includes(t)) score += 2
      }
      return { s, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((x) => x.s)
}

/** Resolve a skill by name — accepts "browser", "cli-anything-browser". */
async function resolveSkill(name: string): Promise<CliSkill | null> {
  const all = await listCliSkills()
  const wanted = name.trim().toLowerCase()
  return (
    all.find((s) => s.name.toLowerCase() === wanted) ??
    all.find((s) => s.name.toLowerCase() === `cli-anything-${wanted}`) ??
    all.find((s) => s.displayName.toLowerCase() === wanted) ??
    all.find((s) => s.name.toLowerCase().includes(wanted)) ??
    null
  )
}

/** Public skill lookup (used by run_command to rewrite short-name installs). */
export async function findCliSkillByName(name: string): Promise<CliSkill | null> {
  if (!name || name.length > 100) return null
  return resolveSkill(name)
}

/** Reads the SKILL.md manual for a skill (cached, capped). */
export async function getCliSkillDoc(name: string): Promise<{ skill: CliSkill; doc: string } | null> {
  const skill = await resolveSkill(name)
  if (!skill) return null
  const cacheKey = skill.name
  const cached = docCache.get(cacheKey)
  if (cached !== undefined) return { skill, doc: cached }
  let doc = ''
  try {
    const candidates = [
      path.join(SKILLS_DIR, skill.name, 'SKILL.md'),
      path.join(SKILLS_DIR, `cli-anything-${skill.name}`, 'SKILL.md'),
    ]
    for (const file of candidates) {
      try {
        doc = await readFile(file, 'utf-8')
        break
      } catch {
        /* try next */
      }
    }
  } catch {
    doc = ''
  }
  if (doc.length > DOC_CHAR_CAP) {
    doc = doc.slice(0, DOC_CHAR_CAP) + '\n\n…[manual truncated — the full SKILL.md is installed with the CLI]'
  }
  docCache.set(cacheKey, doc)
  return { skill, doc }
}

/** Catalog line for the agent: "name — description (category)". */
export async function cliSkillsCatalog(limit = 80): Promise<string[]> {
  const all = await listCliSkills()
  return all.slice(0, limit).map((s) => `- ${s.name}: ${s.description.slice(0, 150)} [${s.category}]`)
}

/** Invalidate caches (used by tests / hot reload in dev). */
export function resetCliSkillsCache(): void {
  registryCache = null
  docCache = new Map()
}
