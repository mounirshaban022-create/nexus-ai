/**
 * NEXUS voice catalog.
 *
 * Two providers:
 * - "nexus": the bundled Z.ai TTS voices (warm, expressive)
 * - "edge": FREE Microsoft neural voices via msedge-tts (no API key,
 *   300+ premium neural voices across languages — the same voices
 *   used by Azure Cognitive Services, available anonymously via the
 *   Edge read-aloud endpoint)
 */

export interface VoiceOption {
  id: string
  label: string
  language: string
  provider: 'nexus' | 'edge'
}

export const NEXUS_VOICES: VoiceOption[] = [
  { id: 'tongtong', label: 'Tongtong', language: 'Warm · friendly', provider: 'nexus' },
  { id: 'chuichui', label: 'Chuichui', language: 'Lively · cute', provider: 'nexus' },
  { id: 'xiaochen', label: 'Xiaochen', language: 'Calm · professional', provider: 'nexus' },
  { id: 'jam', label: 'Jam', language: 'British gentleman', provider: 'nexus' },
  { id: 'kazi', label: 'Kazi', language: 'Clear · standard', provider: 'nexus' },
  { id: 'douji', label: 'Douji', language: 'Natural · fluent', provider: 'nexus' },
  { id: 'luodo', label: 'Luodo', language: 'Expressive', provider: 'nexus' },
]

/** Curated selection of the best free Microsoft neural voices (verified working). */
export const EDGE_VOICES: VoiceOption[] = [
  // English (US)
  { id: 'en-US-AriaNeural', label: 'Aria', language: 'English (US) · natural female', provider: 'edge' },
  { id: 'en-US-JennyNeural', label: 'Jenny', language: 'English (US) · warm female', provider: 'edge' },
  { id: 'en-US-GuyNeural', label: 'Guy', language: 'English (US) · confident male', provider: 'edge' },
  { id: 'en-US-AndrewNeural', label: 'Andrew', language: 'English (US) · deep male', provider: 'edge' },
  { id: 'en-US-EmmaNeural', label: 'Emma', language: 'English (US) · bright female', provider: 'edge' },
  { id: 'en-US-BrianNeural', label: 'Brian', language: 'English (US) · casual male', provider: 'edge' },
  { id: 'en-US-MichelleNeural', label: 'Michelle', language: 'English (US) · smooth female', provider: 'edge' },
  { id: 'en-US-AvaNeural', label: 'Ava', language: 'English (US) · expressive female', provider: 'edge' },
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava ML', language: 'English · multilingual', provider: 'edge' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew ML', language: 'English · multilingual', provider: 'edge' },
  // English (UK / others)
  { id: 'en-GB-SoniaNeural', label: 'Sonia', language: 'English (UK) · female', provider: 'edge' },
  { id: 'en-GB-RyanNeural', label: 'Ryan', language: 'English (UK) · male', provider: 'edge' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha', language: 'English (AU) · female', provider: 'edge' },
  { id: 'en-IN-NeerjaNeural', label: 'Neerja', language: 'English (IN) · female', provider: 'edge' },
  // Arabic
  { id: 'ar-EG-SalmaNeural', label: 'Salma', language: 'Arabic (Egypt) · female', provider: 'edge' },
  { id: 'ar-SA-ZariyahNeural', label: 'Zariyah', language: 'Arabic (Saudi) · female', provider: 'edge' },
  { id: 'ar-SA-HamedNeural', label: 'Hamed', language: 'Arabic (Saudi) · male', provider: 'edge' },
  { id: 'ar-AE-FatimaNeural', label: 'Fatima', language: 'Arabic (UAE) · female', provider: 'edge' },
  { id: 'ar-AE-HamdanNeural', label: 'Hamdan', language: 'Arabic (UAE) · male', provider: 'edge' },
  // European
  { id: 'fr-FR-DeniseNeural', label: 'Denise', language: 'French · female', provider: 'edge' },
  { id: 'fr-FR-HenriNeural', label: 'Henri', language: 'French · male', provider: 'edge' },
  { id: 'es-ES-ElviraNeural', label: 'Elvira', language: 'Spanish · female', provider: 'edge' },
  { id: 'es-ES-AlvaroNeural', label: 'Alvaro', language: 'Spanish · male', provider: 'edge' },
  { id: 'de-DE-KatjaNeural', label: 'Katja', language: 'German · female', provider: 'edge' },
  { id: 'de-DE-ConradNeural', label: 'Conrad', language: 'German · male', provider: 'edge' },
  { id: 'it-IT-ElsaNeural', label: 'Elsa', language: 'Italian · female', provider: 'edge' },
  { id: 'pt-BR-FranciscaNeural', label: 'Francisca', language: 'Portuguese (BR) · female', provider: 'edge' },
  { id: 'ru-RU-SvetlanaNeural', label: 'Svetlana', language: 'Russian · female', provider: 'edge' },
  // Asian
  { id: 'hi-IN-SwaraNeural', label: 'Swara', language: 'Hindi · female', provider: 'edge' },
  { id: 'hi-IN-MadhurNeural', label: 'Madhur', language: 'Hindi · male', provider: 'edge' },
  { id: 'ja-JP-NanamiNeural', label: 'Nanami', language: 'Japanese · female', provider: 'edge' },
  { id: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao', language: 'Chinese · female', provider: 'edge' },
  { id: 'ko-KR-SunHiNeural', label: 'Sun-Hi', language: 'Korean · female', provider: 'edge' },
  { id: 'tr-TR-EmelNeural', label: 'Emel', language: 'Turkish · female', provider: 'edge' },
]

export const ALL_VOICES: VoiceOption[] = [...NEXUS_VOICES, ...EDGE_VOICES]

/**
 * The default voice used by every endpoint that synthesizes speech
 * (/api/tts, /api/voice/turn). PREMIUM Z.ai neural voice — warm and
 * friendly, designed for natural spoken conversation (premium TTS via
 * the z-ai-web-dev-sdk). For Arabic UI the per-language override in
 * /api/tts and /api/voice/turn still swaps to a Microsoft Arabic
 * neural voice because the Z.ai TTS catalog has no Arabic voice.
 *
 * Other premium Z.ai voices available: chuichui (lively), xiaochen
 * (calm/professional), jam (British gentleman), kazi (clear/standard),
 * douji (natural/fluent), luodo (richly expressive).
 */
export const DEFAULT_VOICE = 'en-US-AvaMultilingualNeural' // Premium Microsoft HD voice — multilingual, natural, expressive. Works on Vercel (Edge TTS needs no SDK).

/** Maps a UI language ('en' | 'ar') to a high-quality default Microsoft neural voice. */
export function pickVoiceForLanguage(lang: 'en' | 'ar'): string {
  if (lang === 'ar') return 'ar-SA-HamedNeural'
  return DEFAULT_VOICE
}

export function resolveVoice(voiceId: string): VoiceOption | null {
  return ALL_VOICES.find((v) => v.id === voiceId) ?? null
}

export function isEdgeVoice(voiceId: string): boolean {
  // Edge voice ids look like "en-US-AriaNeural"
  return /^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(voiceId) || voiceId.includes('Neural')
}

/**
 * FREE-FOREVER FALLBACK MAP — when the Z.ai engine is unavailable (e.g. on
 * Vercel, where the internal gateway is unreachable), every premium NEXUS
 * voice transparently maps to a FREE Microsoft neural voice with a similar
 * character. Voice mode keeps working end-to-end with zero paid services.
 */
const NEXUS_TO_EDGE: Record<string, string> = {
  tongtong: 'en-US-AvaMultilingualNeural', // warm · friendly
  chuichui: 'en-US-EmmaNeural', // lively · bright
  xiaochen: 'en-US-MichelleNeural', // calm · professional
  jam: 'en-GB-RyanNeural', // British gentleman
  kazi: 'en-US-AndrewNeural', // clear · standard
  douji: 'en-US-BrianNeural', // natural · casual
  luodo: 'en-US-AvaNeural', // expressive
}

/** Returns a FREE Edge voice id for any voice id (Edge ids pass through). */
export function edgeFallbackFor(voiceId: string): string {
  if (isEdgeVoice(voiceId)) return voiceId
  return NEXUS_TO_EDGE[voiceId] ?? DEFAULT_VOICE
}
