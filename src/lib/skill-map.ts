/**
 * SKILL MAP (client-safe) — the pure capability mapping used by BOTH:
 *  - src/lib/skill-actions.ts (server executor)
 *  - src/components/omni/skills-mode.tsx (UI badges + install state)
 *
 * No server-only imports live here.
 */

export type SkillActionKind =
  | 'image'
  | 'video'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'search'
  | 'read'
  | 'speak'
  | 'diagram'
  | 'research'

export interface SkillActionMeta {
  kind: SkillActionKind
  /** Human label shown on the animated run card. */
  label: string
  /** Emoji glyph for the card. */
  emoji: string
  /** True when the skill natively maps to cloud execution (vs. research). */
  cloudNative: boolean
  /** Short chip label for the skills directory. */
  chip: string
}

/** Per-skill overrides (by short name, e.g. "blender"). */
export const SKILL_OVERRIDES: Record<string, SkillActionKind> = {
  // image creation / editing / design
  gimp: 'image', inkscape: 'image', krita: 'image', sketch: 'image',
  inkstitch: 'diagram', anygen: 'image', comfyui: 'image', magnific: 'image',
  novita: 'image', minimax: 'image', live2d: 'image', '3mf': 'diagram',
  // video / streaming
  kdenlive: 'video', shotcut: 'video', openscreen: 'video',
  videocaptioner: 'video', quietshrink: 'video', palmier: 'video',
  'obs-studio': 'video',
  // documents / knowledge / office
  libreoffice: 'doc', joplin: 'doc', obsidian: 'doc', siyuan: 'doc',
  mubu: 'doc', calibre: 'doc', zotero: 'research', 'firefly-iii': 'sheet',
  openrefine: 'sheet', chromadb: 'research',
  // search / web / osint
  exa: 'search', 'hacker-feeds-cli': 'search', browser: 'read',
  clibrowser: 'read', safari: 'read', 'web-yu-pri': 'search',
  intelwatch: 'search', tinyfish: 'search',
  // diagrams / spatial
  drawio: 'diagram', mermaid: 'diagram', qgis: 'diagram',
  // audio / music / voice
  audacity: 'speak', wavetone: 'speak', musescore: 'speak',
  've-twini': 'speak', zoom: 'speak',
  // 3d / gamedev — render stills of the requested model/scene
  blender: 'image', freecad: 'image', meerk40t: 'diagram',
  godot: 'image', ueatelier: 'image', sbox: 'image',
}

/** Category defaults for skills without an explicit override. */
export const CATEGORY_DEFAULTS: Record<string, SkillActionKind> = {
  image: 'image', generation: 'image', design: 'image', graphics: 'image',
  ai: 'image', video: 'video', streaming: 'video',
  office: 'doc', knowledge: 'doc', 'knowledge-management': 'doc',
  finance: 'sheet', database: 'sheet', science: 'research', scientific: 'diagram',
  search: 'search', web: 'read', osint: 'search', network: 'search',
  diagrams: 'diagram', audio: 'speak', music: 'speak', communication: 'speak',
  '3d': 'image', gamedev: 'image', game: 'research',
  automation: 'doc', devops: 'research', testing: 'research',
  debugging: 'research', 'project-management': 'doc', storage: 'research',
}

export const ACTION_META: Record<SkillActionKind, SkillActionMeta> = {
  image:    { kind: 'image',    label: 'Generating art with FLUX',        emoji: '🎨', cloudNative: true,  chip: 'AI image' },
  video:    { kind: 'video',    label: 'Directing an AI video',           emoji: '🎬', cloudNative: true,  chip: 'AI video' },
  doc:      { kind: 'doc',      label: 'Writing a document',              emoji: '📄', cloudNative: true,  chip: 'Word doc' },
  sheet:    { kind: 'sheet',    label: 'Building a spreadsheet',          emoji: '📊', cloudNative: true,  chip: 'Excel' },
  slides:   { kind: 'slides',   label: 'Designing slides',                emoji: '📽️', cloudNative: true,  chip: 'Slides' },
  search:   { kind: 'search',   label: 'Searching the live web',          emoji: '🔎', cloudNative: true,  chip: 'Web search' },
  read:     { kind: 'read',     label: 'Reading the page',                emoji: '📖', cloudNative: true,  chip: 'Page reader' },
  speak:    { kind: 'speak',    label: 'Synthesizing voice',              emoji: '🎙️', cloudNative: true,  chip: 'Neural voice' },
  diagram:  { kind: 'diagram',  label: 'Drawing a diagram',               emoji: '📐', cloudNative: true,  chip: 'Diagram' },
  research: { kind: 'research', label: 'Researching + briefing doc',      emoji: '🧠', cloudNative: true,  chip: 'Research' },
}

/** Resolve the executable action for a skill name (full or short form). */
export function resolveSkillAction(skillName: string, category?: string): SkillActionMeta {
  const short = skillName.replace(/^cli-anything-/, '')
  const kind =
    SKILL_OVERRIDES[short] ??
    CATEGORY_DEFAULTS[(category ?? '').toLowerCase()] ??
    'research'
  return ACTION_META[kind]
}
