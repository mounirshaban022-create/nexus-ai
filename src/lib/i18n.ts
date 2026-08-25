'use client'

/**
 * NEXUS i18n — complete English / Arabic UI translation layer.
 *
 * Single source of truth for every user-facing string in the NEXUS One
 * shell, chat, settings and overlays. Components call `const { t, lang,
 * isRTL } = useI18n()` and render `t('key')` — switching the language in
 * Settings re-renders the whole app instantly (zustand-driven), with
 * `dir="rtl"` + the Arabic font applied at the document level.
 *
 * Arabic is complete Modern Standard Arabic (العربية الفصحى) — natural,
 * warm, and interface-appropriate. Strings with {placeholders} are filled
 * via t('key', { name }) for interpolation.
 */

import { usePreferences } from '@/lib/preferences'

export type Lang = 'en' | 'ar'

/* ------------------------------------------------------------------ */
/* Dictionary                                                          */
/* ------------------------------------------------------------------ */

export const STRINGS = {
  /* ---- navigation / shell ---- */
  nav: {
    newChat: { en: 'New chat', ar: 'محادثة جديدة' },
    searchChats: { en: 'Search chats', ar: 'ابحث في المحادثات' },
    noConversations: { en: 'No conversations yet — start one above.', ar: 'لا توجد محادثات بعد — ابدأ واحدة من الأعلى.' },
    conversations: { en: 'Conversations', ar: 'المحادثات' },
    agents: { en: 'Agents', ar: 'الوكلاء' },
    whatsapp: { en: 'WhatsApp', ar: 'واتساب' },
    skills: { en: 'Skills', ar: 'المهارات' },
    settings: { en: 'Settings', ar: 'الإعدادات' },
    profile: { en: 'Profile', ar: 'الملف الشخصي' },
    signIn: { en: 'Sign in', ar: 'تسجيل الدخول' },
    signOut: { en: 'Sign out', ar: 'تسجيل الخروج' },
    openNav: { en: 'Open navigation menu', ar: 'فتح قائمة التنقل' },
    chat: { en: 'Chat', ar: 'المحادثة' },
    home: { en: 'Home', ar: 'الرئيسية' },
    untitled: { en: 'New conversation', ar: 'محادثة جديدة' },
    pinnedSpecialist: { en: 'Pinned specialist', ar: 'وكيل مثبّت' },
    sheetTitle: { en: 'NEXUS navigation', ar: 'التنقل في NEXUS' },
    bottomNav: { en: 'Main navigation', ar: 'التنقل الرئيسي' },
  },

  /* ---- chat surface ---- */
  chat: {
    welcomeTitleA: { en: 'What can I do for', ar: 'بمَ يمكنني مساعدتك' },
    welcomeTitleB: { en: 'you?', ar: 'اليوم؟' },
    welcomeSub: {
      en: 'One conversation, every superpower — the right specialist takes over automatically.',
      ar: 'محادثة واحدة بكل القدرات — المتخصص المناسب يتولى الأمر تلقائيًا.',
    },
    messageAgent: { en: 'Message {name}…', ar: 'راسل {name}…' },
    pinned: { en: 'pinned', ar: 'مثبّت' },
    auto: { en: 'auto', ar: 'تلقائي' },
    unpin: { en: 'Unpin — return to auto-routing', ar: 'إلغاء التثبيت — العودة للتوجيه التلقائي' },
    attachFile: { en: 'Attach a file', ar: 'إرفاق ملف' },
    voiceMode: { en: 'Voice mode', ar: 'الوضع الصوتي' },
    stopGenerating: { en: 'Stop generating', ar: 'إيقاف التوليد' },
    sendMessage: { en: 'Send message', ar: 'إرسال الرسالة' },
    removeAttachment: { en: 'Remove attachment', ar: 'إزالة المرفق' },
    attachTooLarge: { en: 'That file is too large (max 14 MB).', ar: 'الملف كبير جدًا (الحد الأقصى 14 ميغابايت).' },
    attachReadError: { en: 'Could not read that file.', ar: 'تعذّرت قراءة الملف.' },
    attachAllTypes: { en: 'Word, PDF, Excel, PowerPoint, images, text', ar: 'وورد وPDF وإكسل وباوربوينت وصور ونصوص' },
    thinking: { en: 'Thinking…', ar: 'جارٍ التفكير…' },
    routing: { en: 'NEXUS is routing your message…', ar: 'يقوم NEXUS بتوجيه رسالتك…' },
    picking: { en: 'Picking the right specialist…', ar: 'جارٍ اختيار المتخصص المناسب…' },
    continuing: { en: 'Continuing…', ar: 'متابعة…' },
    working: { en: 'Working…', ar: 'جارٍ العمل…' },
    somethingWrong: { en: 'Something went wrong. Please try again.', ar: 'حدث خطأ ما. حاول مرة أخرى.' },
    requestFailed: { en: 'Chat request failed.', ar: 'فشل طلب المحادثة.' },
    errorPrefix: { en: 'Something went wrong: {msg}', ar: 'حدث خطأ: {msg}' },
    hintPinned: { en: '{name} is pinned — replies start instantly, no routing delay.', ar: '{name} مثبّت — تبدأ الردود فورًا دون تأخير التوجيه.' },
    hintAuto: {
      en: '{name} can create images & videos, build documents, run code, browse the web and send messages.',
      ar: 'يستطيع {name} إنشاء الصور والفيديو، وبناء المستندات، وتشغيل الأكواد، وتصفح الويب، وإرسال الرسائل.',
    },
    attachedDoc: { en: 'Attached document', ar: 'مستند مرفق' },
    core: { en: 'NEXUS core', ar: 'نواة NEXUS' },
    tookOver: { en: 'took over', ar: 'تولّى الأمر' },
    unpinAgent: {
      en: 'Unpin {name} and return to auto-routing',
      ar: 'إلغاء تثبيت {name} والعودة إلى التوجيه التلقائي',
    },
  },

  /* ---- welcome capability cards ---- */
  caps: {
    imageTitle: { en: 'Create images', ar: 'إنشاء الصور' },
    imageDesc: { en: 'Posters, logos, art and photo-real shots.', ar: 'ملصقات وشعارات وأعمال فنية وصور واقعية.' },
    videoTitle: { en: 'Make videos', ar: 'إنشاء الفيديو' },
    videoDesc: { en: 'Short AI clips with narration and captions.', ar: 'مقاطع قصيرة بالذكاء الاصطناعي مع تعليق وترجمة.' },
    docTitle: { en: 'Build documents', ar: 'بناء المستندات' },
    docDesc: { en: 'Word, Excel, PDF and PowerPoint files.', ar: 'ملفات وورد وإكسل وPDF وباوربوينت.' },
    codeTitle: { en: 'Write & run code', ar: 'كتابة وتشغيل الأكواد' },
    codeDesc: { en: 'JavaScript, Python, sandboxes included.', ar: 'جافاسكريبت وبايثون مع بيئات تنفيذ آمنة.' },
    webTitle: { en: 'Browse the live web', ar: 'تصفح الويب الحي' },
    webDesc: { en: 'Search, read pages, click and act.', ar: 'بحث وقراءة الصفحات والنقر والتنفيذ.' },
    emailTitle: { en: 'Email & WhatsApp', ar: 'البريد وواتساب' },
    emailDesc: { en: 'Read, write, organize and send messages.', ar: 'اقرأ واكتب ونظّم وأرسل الرسائل.' },
    voiceTitle: { en: 'Talk by voice', ar: 'التحدث بالصوت' },
    voiceDesc: { en: 'Natural conversations, beautiful voices.', ar: 'محادثات طبيعية بأصوات جميلة.' },
    sugg1: { en: 'Plan a launch for my app', ar: 'خطّط لإطلاق تطبيقي' },
    sugg2: { en: 'Make a logo for a coffee brand', ar: 'صمّم شعارًا لعلامة قهوة' },
    sugg3: { en: 'Analyze this spreadsheet', ar: 'حلّل هذا الجدول' },
    sugg4: { en: 'Write a cold email to investors', ar: 'اكتب بريدًا للمستثمرين' },
    imagePrompt: { en: 'Generate an image of ', ar: 'أنشئ صورة لـ ' },
    videoPrompt: { en: 'Make a 4-scene video about ', ar: 'أنشئ فيديو من 4 مشاهد عن ' },
    docPrompt: { en: 'Create a Word document that ', ar: 'أنشئ مستند وورد يتضمّن ' },
    webPrompt: {
      en: 'Open https://en.wikipedia.org/wiki/Artificial_intelligence and summarize it',
      ar: 'افتح https://en.wikipedia.org/wiki/Artificial_intelligence ولخّص لي محتواه',
    },
  },

  /* ---- personality rail ---- */
  personality: {
    label: { en: 'Personality', ar: 'الشخصية' },
    auto: { en: 'Auto', ar: 'تلقائي' },
    allAgents: { en: 'All {count}', ar: 'الكل ({count})' },
    autoDesc: { en: 'Best specialist takes over automatically', ar: 'المتخصص الأنسب يتولى الأمر تلقائيًا' },
    pinnedInstant: { en: 'pinned — instant, no routing delay', ar: 'مثبّت — رد فوري دون تأخير التوجيه' },
    pinnedFromDir: {
      en: 'pinned from directory — click to return to Auto',
      ar: 'مثبّت من الدليل — انقر للعودة إلى «تلقائي»',
    },
  },

  /* ---- agents directory ---- */
  agents: {
    title: { en: 'The Agency', ar: 'الوكالة' },
    back: { en: 'Back to chat', ar: 'العودة إلى المحادثة' },
    close: { en: 'Close directory', ar: 'إغلاق الدليل' },
    searchPlaceholder: {
      en: 'Search specialists — try “frontend” or “logo”…',
      ar: 'ابحث عن متخصصين — جرّب «واجهات» أو «شعار»…',
    },
    searchLabel: { en: 'Search specialists', ar: 'البحث عن متخصصين' },
    clearSearch: { en: 'Clear search', ar: 'مسح البحث' },
    all: { en: 'All', ar: 'الكل' },
    filterByDivision: { en: 'Filter by division', ar: 'تصفية حسب القسم' },
    specialistsCount: { en: '{count} specialists', ar: '{count} من المتخصصين' },
    specialistsOf: { en: '{count} of {total}', ar: '{count} من أصل {total}' },
    pinnedLabel: { en: 'Pinned', ar: 'مثبّت' },
    pinnedNote: { en: 'auto-routing paused for this chat.', ar: 'التوجيه التلقائي متوقف مؤقتًا في هذه المحادثة.' },
    unpin: { en: 'Unpin', ar: 'إلغاء التثبيت' },
    pin: { en: 'Pin to current chat', ar: 'تثبيت في هذه المحادثة' },
    chat: { en: 'Chat', ar: 'محادثة' },
    showMore: { en: 'Show {count} more · {remaining} remaining', ar: 'عرض {count} أخرى · تبقّى {remaining}' },
    noMatchTitle: { en: 'No specialists match', ar: 'لا توجد نتائج مطابقة' },
    noMatchDesc: { en: 'Try a different search or division.', ar: 'جرّب كلمة بحث أو قسمًا مختلفًا.' },
    clearFilters: { en: 'Clear filters', ar: 'مسح عوامل التصفية' },
    agency: { en: 'Agency', ar: 'الوكالة' },
  },

  /* ---- settings / profile ---- */
  settings: {
    settings: { en: 'Settings', ar: 'الإعدادات' },
    profile: { en: 'Profile', ar: 'الملف الشخصي' },
    account: { en: 'Account', ar: 'الحساب' },
    appearance: { en: 'Appearance', ar: 'المظهر' },
    theme: { en: 'Theme', ar: 'السمة' },
    light: { en: 'Light', ar: 'فاتح' },
    dark: { en: 'Dark', ar: 'داكن' },
    language: { en: 'Language', ar: 'اللغة' },
    english: { en: 'English', ar: 'الإنجليزية' },
    arabic: { en: 'العربية', ar: 'العربية' },
    editProfile: { en: 'Edit profile', ar: 'تعديل الملف الشخصي' },
    name: { en: 'Name', ar: 'الاسم' },
    bio: { en: 'Bio', ar: 'نبذة' },
    location: { en: 'Location', ar: 'الموقع' },
    timezone: { en: 'Timezone', ar: 'المنطقة الزمنية' },
    memberSince: { en: 'Member since', ar: 'عضو منذ' },
    guest: { en: 'Guest', ar: 'زائر' },
    guestHint: { en: 'Sign in to sync your chats, memories and connections.', ar: 'سجّل الدخول لمزامنة محادثاتك وذكرياتك واتصالاتك.' },
    conversations: { en: 'Conversations', ar: 'المحادثات' },
    memories: { en: 'Memories', ar: 'الذكريات' },
    skillsUsed: { en: 'Skills', ar: 'المهارات' },
    creations: { en: 'Creations', ar: 'الإبداعات' },
    connections: { en: 'Connections', ar: 'الاتصالات' },
    email: { en: 'Email', ar: 'البريد الإلكتروني' },
    emailConnect: { en: 'Connect your email', ar: 'اربط بريدك الإلكتروني' },
    emailConnected: { en: 'Email connected', ar: 'البريد متصل' },
    emailDesc: {
      en: 'Connect Gmail, Outlook or any IMAP account — NEXUS reads, organizes, drafts and sends email for you, like a real assistant.',
      ar: 'اربط جيميل أو أوتلوك أو أي حساب IMAP — يقرأ NEXUS بريدك وينظّمه ويصيغ الرسائل ويرسلها نيابةً عنك، كمساعد حقيقي.',
    },
    connect: { en: 'Connect', ar: 'ربط' },
    connected: { en: 'Connected', ar: 'متصل' },
    disconnect: { en: 'Disconnect', ar: 'فصل' },
    test: { en: 'Test connection', ar: 'اختبار الاتصال' },
    emailHint: { en: 'your@email.com', ar: 'بريدك@الإلكتروني.com' },
    password: { en: 'Password / App password', ar: 'كلمة المرور / كلمة مرور التطبيق' },
    imapHost: { en: 'IMAP host', ar: 'خادم IMAP' },
    smtpHost: { en: 'SMTP host', ar: 'خادم SMTP' },
    port: { en: 'Port', ar: 'المنفذ' },
    useGmail: { en: 'Use Gmail presets', ar: 'استخدام إعدادات جيميل' },
    useOutlook: { en: 'Use Outlook presets', ar: 'استخدام إعدادات أوتلوك' },
    connectionOk: { en: 'Connection successful — NEXUS can access your inbox.', ar: 'نجح الاتصال — يستطيع NEXUS الوصول إلى بريدك.' },
    connectionFailed: { en: 'Connection failed', ar: 'فشل الاتصال' },
    aiProviders: { en: 'AI providers', ar: 'مزوّدو الذكاء الاصطناعي' },
    aiProvidersDesc: { en: 'Bring your own API key — OpenRouter, Groq, Gemini, Cohere and more.', ar: 'أضف مفتاح API الخاص بك — OpenRouter وGroq وGemini وCohere والمزيد.' },
    legal: { en: 'Legal', ar: 'قانوني' },
    privacyPolicy: { en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
    termsOfService: { en: 'Terms of Service', ar: 'شروط الاستخدام' },
    creator: { en: 'Creator', ar: 'المبتكر' },
    creatorRole: { en: 'Creator & Developer', ar: 'المبتكر والمطوّر' },
    save: { en: 'Save', ar: 'حفظ' },
    saved: { en: 'Saved', ar: 'تم الحفظ' },
    cancel: { en: 'Cancel', ar: 'إلغاء' },
    preferences: { en: 'Preferences', ar: 'التفضيلات' },
    dangerZone: { en: 'Danger zone', ar: 'منطقة الخطر' },
    settingsDesc: { en: 'Profile, AI providers, email, preferences and more.', ar: 'الملف الشخصي، مزوّدو الذكاء، البريد، التفضيلات والمزيد.' },
    addProvider: { en: 'Add provider', ar: 'إضافة مزوّد' },
    apiKey: { en: 'API key', ar: 'مفتاح API' },
    model: { en: 'Model', ar: 'النموذج' },
    darkByDesign: { en: 'NEXUS is dark by design — deep blacks, warm brand accents.', ar: 'NEXUS داكن بالتصميم — سواد عميق ولمسات العلامة الدافئة.' },
    emailAskHint: { en: 'Then ask NEXUS in chat: “check my inbox” or “organize my emails”.', ar: 'ثم اطلب من NEXUS في المحادثة: «افحص بريدي» أو «نظّم رسائلي».' },
    changePhoto: { en: 'Change photo', ar: 'تغيير الصورة' },
    verifying: { en: 'Verifying…', ar: 'جارٍ التحقق…' },
    creatorLocation: { en: 'Mansoura, Egypt', ar: 'المنصورة، مصر' },
  },

  /* ---- chat actions / common ---- */
  common: {
    delete: { en: 'Delete', ar: 'حذف' },
    deleteChat: { en: 'Delete conversation', ar: 'حذف المحادثة' },
    deleteChatConfirm: { en: 'Delete this conversation permanently?', ar: 'حذف هذه المحادثة نهائيًا؟' },
    chatDeleted: { en: 'Conversation deleted', ar: 'تم حذف المحادثة' },
    close: { en: 'Close', ar: 'إغلاق' },
    back: { en: 'Back', ar: 'رجوع' },
    loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },
    retry: { en: 'Try again', ar: 'أعد المحاولة' },
    copy: { en: 'Copy', ar: 'نسخ' },
    copied: { en: 'Copied', ar: 'تم النسخ' },
    search: { en: 'Search', ar: 'بحث' },
    now: { en: 'now', ar: 'الآن' },
    yes: { en: 'Yes', ar: 'نعم' },
    no: { en: 'No', ar: 'لا' },
    deleteQ: { en: 'Delete?', ar: 'حذف؟' },
    deleteFailed: { en: 'Could not delete the conversation', ar: 'تعذّر حذف المحادثة' },
    download: { en: 'Download', ar: 'تنزيل' },
  },
} as const

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export type StringEntry = { en: string; ar: string }

/** Resolve a dictionary entry for a language. */
export function tr(entry: StringEntry, lang: Lang): string {
  return entry[lang] ?? entry.en
}

/** Fill `{placeholder}` tokens in a translated string. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

/**
 * The i18n hook. Reads the persisted language preference (zustand) and
 * returns a `t(key, vars?)` translator plus direction helpers.
 *
 * Usage:
 *   const { t, lang, isRTL } = useI18n()
 *   t('chat.messageAgent', { name: 'NEXUS' })
 */
export function useI18n() {
  const lang = usePreferences((s) => s.language) as Lang
  return {
    lang,
    isRTL: lang === 'ar',
    dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    t: (path: string, vars?: Record<string, string>): string => {
      const segments = path.split('.')
      let node: unknown = STRINGS
      for (const seg of segments) {
        node = (node as Record<string, unknown>)?.[seg]
        if (node == null) break
      }
      if (node == null || typeof node !== 'object') {
        if (process.env.NODE_ENV === 'development') console.warn(`[i18n] missing key: ${path}`)
        return path
      }
      const value = interpolate(tr(node as StringEntry, lang), vars ?? {})
      return value
    },
  }
}

/** Non-hook translator for event handlers / module scope. */
export function translate(path: string, lang: Lang, vars?: Record<string, string>): string {
  const segments = path.split('.')
  let node: unknown = STRINGS
  for (const seg of segments) {
    node = (node as Record<string, unknown>)?.[seg]
    if (node == null) break
  }
  if (node == null || typeof node !== 'object') return path
  return interpolate(tr(node as StringEntry, lang), vars ?? {})
}
