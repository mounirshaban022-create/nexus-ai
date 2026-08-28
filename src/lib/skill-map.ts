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
  | 'translate'
  | 'weather'
  | 'chart'
  | 'qr'
  | 'password'

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
  novita: 'image', minimax: 'speak', live2d: 'image', '3mf': 'diagram',
  // video / streaming
  kdenlive: 'video', shotcut: 'video', openscreen: 'video',
  videocaptioner: 'video', quietshrink: 'video', palmier: 'video',
  'obs-studio': 'video',
  // documents / knowledge / office
  libreoffice: 'doc', joplin: 'doc', obsidian: 'doc', siyuan: 'doc',
  mubu: 'doc', calibre: 'doc', zotero: 'research', 'firefly-iii': 'sheet',
  openrefine: 'sheet', chromadb: 'research', mailchimp: 'doc', seaclip: 'doc',
  // search / web / osint
  exa: 'search', 'hacker-feeds-cli': 'search', browser: 'read',
  clibrowser: 'read', safari: 'read', 'web-yu-pri': 'search',
  intelwatch: 'search', tinyfish: 'search',
  // diagrams / spatial
  drawio: 'diagram', mermaid: 'diagram', qgis: 'diagram',
  // audio / music / voice / comms
  audacity: 'speak', wavetone: 'speak', musescore: 'speak',
  've-twini': 'research', zoom: 'research',
  // 3d / gamedev — render stills of the requested model/scene
  blender: 'image', freecad: 'image', meerk40t: 'diagram',
  godot: 'image', ueatelier: 'image', sbox: 'image',
  // LLM / chat / workflow runtimes (the old 'ai → image' default made these
  // silently draw pictures — they are Q&A/research tools instead)
  ollama: 'research', openwebui: 'research', notebooklm: 'research',
  'dify-workflow': 'research', 'cc-switch': 'research',
}

/** Category defaults for skills without an explicit override. */
export const CATEGORY_DEFAULTS: Record<string, SkillActionKind> = {
  image: 'image', generation: 'image', design: 'image', graphics: 'image',
  ai: 'research', video: 'video', streaming: 'video',
  office: 'doc', knowledge: 'doc', 'knowledge-management': 'doc',
  finance: 'sheet', database: 'research', science: 'research', scientific: 'diagram',
  search: 'search', web: 'read', osint: 'search', network: 'research',
  diagrams: 'diagram', audio: 'speak', music: 'speak', communication: 'speak',
  '3d': 'image', gamedev: 'image', game: 'research',
  automation: 'research', devops: 'research', testing: 'research',
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
  translate:{ kind: 'translate',label: 'Translating text',                emoji: '🌍', cloudNative: true,  chip: 'Translator' },
  weather:  { kind: 'weather',  label: 'Checking live weather',           emoji: '🌤️', cloudNative: true,  chip: 'Weather' },
  chart:    { kind: 'chart',    label: 'Rendering a chart',               emoji: '📈', cloudNative: true,  chip: 'Chart' },
  qr:       { kind: 'qr',       label: 'Engraving a QR code',             emoji: '🔳', cloudNative: true,  chip: 'QR code' },
  password: { kind: 'password', label: 'Forging secure secrets',          emoji: '🔐', cloudNative: true,  chip: 'Passwords' },
}

/** Resolve the executable action for a skill name (full or short form). */
export function resolveSkillAction(skillName: string, category?: string): SkillActionMeta {
  const short = skillName.replace(/^cli-anything-/, '')
  const kind =
    SKILL_OVERRIDES[short] ??
    (CLOUD_SKILLS.find((s) => s.name === short || s.name === skillName)?.action as SkillActionKind | undefined) ??
    CATEGORY_DEFAULTS[(category ?? '').toLowerCase()] ??
    'research'
  return ACTION_META[kind] ?? ACTION_META.research
}

/* ------------------------------------------------------------------ */
/* NEXUS CLOUD SKILLS — first-party skills that run on free keyless    */
/* cloud APIs. They appear in the Skills directory next to the 79      */
/* vendored CLI skills and execute REAL actions with no setup.         */
/* ------------------------------------------------------------------ */

export interface CloudSkill {
  /** Short skill name (never prefixed with cli-anything-). */
  name: string
  displayName: string
  description: string
  category: string
  /** Executable action kind. */
  action: SkillActionKind
  /** Badge shown in the directory. */
  badge: string
  /** Free service powering the skill (shown on the card). */
  powered: string
  installCmd?: string
}

/** Number of vendored CLI-Anything agent skills in the full catalog —
 *  mirrors listAllSkills() in src/lib/cli-skills.ts. Kept as a static
 *  constant so client-side badges stay in sync without a fetch. */
export const VENDORED_SKILLS_COUNT = 79

export const CLOUD_SKILLS: CloudSkill[] = [
  {
    name: 'nexus-translate',
    displayName: 'NEXUS Translate',
    description:
      'Translate any text between 90+ languages with natural, context-aware phrasing — plus a short pronunciation guide. Free, instant, no keys.',
    category: 'cloud',
    action: 'translate',
    badge: 'NEW',
    powered: 'Free AI pool',
  },
  {
    name: 'nexus-weather',
    displayName: 'NEXUS Weather',
    description:
      'Live weather for any city on Earth — current conditions, hourly trend and a 3-day outlook, narrated in plain language.',
    category: 'cloud',
    action: 'weather',
    badge: 'NEW',
    powered: 'wttr.in',
  },
  {
    name: 'nexus-chart',
    displayName: 'NEXUS Chart Studio',
    description:
      'Turn any data you describe into a polished chart — bar, line, pie, radar, doughnut — rendered as a downloadable image.',
    category: 'cloud',
    action: 'chart',
    badge: 'NEW',
    powered: 'QuickChart',
  },
  {
    name: 'nexus-qr',
    displayName: 'NEXUS QR Forge',
    description:
      'Create crisp, high-resolution QR codes for links, Wi-Fi logins, plain text, contact cards — anything, instantly.',
    category: 'cloud',
    action: 'qr',
    badge: 'NEW',
    powered: 'goQR.me',
  },
  {
    name: 'nexus-passguard',
    displayName: 'NEXUS PassGuard',
    description:
      'Generate cryptographically secure passwords, passphrases and API keys — with strength analysis and breach-safe construction.',
    category: 'cloud',
    action: 'password',
    badge: 'NEW',
    powered: 'Node crypto',
  },
  {
    name: 'nexus-research',
    displayName: 'NEXUS Deep Research',
    description:
      'Multi-source live research with citations, distilled into a downloadable briefing document (DOCX) with how-tos and pitfalls.',
    category: 'cloud',
    action: 'research',
    badge: 'PRO',
    powered: 'Brave + DDG + Wikipedia',
  },
  {
    name: 'nexus-narrator',
    displayName: 'NEXUS Narrator',
    description:
      'Turn any text into natural neural speech with free Microsoft Edge voices — pick a voice, press play, download the MP3.',
    category: 'cloud',
    action: 'speak',
    badge: 'PRO',
    powered: 'Edge TTS',
  },
]
