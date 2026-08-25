'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CommStyle = 'concise' | 'balanced' | 'detailed' | 'friendly'
export type Interest = 'writing' | 'coding' | 'research' | 'design' | 'business' | 'learning' | 'creative' | 'productivity'

interface PreferencesState {
  // Onboarding
  onboarded: boolean
  name: string
  interests: Interest[]
  commStyle: CommStyle
  // Onboarding (Task 6 — richer profile, mirrored locally)
  bio: string
  location: string
  timezone: string
  avatarUrl: string
  // Appearance
  theme: 'light' | 'dark'
  language: 'en' | 'ar'
  // Auth gate (Task 13): once user clicks "Continue as guest" on the auth landing,
  // skip it until they sign out (which clears this).
  guestMode: boolean
  // Actions: onboarding
  completeOnboarding: (data: {
    name: string
    interests: Interest[]
    commStyle: CommStyle
    bio?: string
    location?: string
    timezone?: string
    avatarUrl?: string
  }) => void
  resetOnboarding: () => void
  // Actions: auth gate
  setGuestMode: (v: boolean) => void
  // Actions: appearance
  toggleTheme: () => void
  setTheme: (t: 'light' | 'dark') => void
  toggleLanguage: () => void
  setLanguage: (l: 'en' | 'ar') => void
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      onboarded: false,
      name: '',
      interests: [],
      commStyle: 'balanced',
      bio: '',
      location: '',
      timezone: '',
      avatarUrl: '',
      theme: 'light',
      language: 'en',
      guestMode: false,
      completeOnboarding: ({ name, interests, commStyle, bio, location, timezone, avatarUrl }) =>
        set({
          name,
          interests,
          commStyle,
          bio: bio ?? '',
          location: location ?? '',
          timezone: timezone ?? '',
          avatarUrl: avatarUrl ?? '',
          onboarded: true,
        }),
      resetOnboarding: () =>
        set({
          onboarded: false,
          name: '',
          interests: [],
          commStyle: 'balanced',
          bio: '',
          location: '',
          timezone: '',
          avatarUrl: '',
          guestMode: false,
        }),
      setGuestMode: (guestMode) => set({ guestMode }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
      toggleLanguage: () => set((s) => ({ language: s.language === 'en' ? 'ar' : 'en' })),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'nexus-preferences' }
  )
)

/** Applies the persisted UI preferences to the document element.
 *
 * THEME (Task 6): The theme is now driven by `next-themes` — the
 * ThemeProvider in `src/app/layout.tsx` is the single source of truth
 * for the `.dark` class on <html> (it persists to its own `theme`
 * localStorage key and runs its own pre-hydration script). This
 * function therefore NO LONGER touches the dark class — passing a
 * `theme` argument is allowed for backward-compatibility with the
 * original call sites (e.g. `src/app/page.tsx`) but the value is
 * ignored. Theme switching is done via `useTheme()` from next-themes
 * (see `theme-toggle.tsx` + the Appearance section in
 * `settings-mode.tsx`).
 *
 * LANGUAGE: still applied here — `dir` + `lang` attributes on <html>.
 */
export function applyPreferences(_theme: string, language: string) {
  if (typeof document === 'undefined') return
  // Theme is owned by next-themes — do not toggle the dark class here.
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = language
}

// ===== Translations =====
export const t = {
  en: {
    chat: 'Chat', voice: 'Voice', agent: 'Agent', search: 'Search', more: 'More',
    projects: 'Projects', explore: 'Explore', library: 'Library',
    settings: 'Settings', profile: 'Profile', appearance: 'Appearance',
    language: 'Language', light: 'Light', dark: 'Dark', english: 'English', arabic: 'العربية',
    account: 'Account', signIn: 'Sign in', signOut: 'Sign out', signUp: 'Create account',
    email: 'Email', password: 'Password', legal: 'Legal', privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service', creator: 'Creator',
    askAnything: 'How can I help you today?', send: 'Send',
    newChat: 'New Chat', tools: 'Tools', close: 'Close',
    messageNexus: 'Message Nexus...',
    emptyTitleGuest: 'What can',
    emptyTitleUser: 'Hi',
    emptyHelp: 'Ask anything, create something, or give Nexus a task.',
    suggestResearch: 'Research something',
    suggestResearchSub: 'Deep dive into any topic',
    suggestAnalyze: 'Analyze a file',
    suggestAnalyzeSub: 'PDFs, docs, code & more',
    suggestCreate: 'Create something',
    suggestCreateSub: 'Images, videos & writing',
    suggestCode: 'Help me code',
    suggestCodeSub: 'Write, debug, or explain',
    intel: 'Intelligence', intelAuto: 'Auto', intelFast: 'Fast',
    intelReasoning: 'Reasoning', intelVision: 'Vision',
    intelAutoDesc: 'Best model for the task',
    intelFastDesc: 'Quick everyday conversations',
    intelReasoningDesc: 'Complex analysis & hard problems',
    intelVisionDesc: 'Images & visual understanding',
    personalization: 'Personalization',
    emailApps: 'Email & apps', theme: 'Theme', rerunOnboarding: 'Re-run onboarding',
    yourInterests: 'Your interests', memberSince: 'Member since',
    style: 'style', guestMode: 'Guest mode', editProfile: 'Edit profile',
    allSystemsOperational: 'All systems operational', version: 'v1.0',
    privacy: 'Privacy', terms: 'Terms',
  },
  ar: {
    chat: 'محادثة', voice: 'صوت', agent: 'وكيل', search: 'بحث', more: 'المزيد',
    projects: 'المشاريع', explore: 'استكشاف', library: 'المكتبة',
    settings: 'الإعدادات', profile: 'الملف الشخصي', appearance: 'المظهر',
    language: 'اللغة', light: 'فاتح', dark: 'داكن', english: 'English', arabic: 'العربية',
    account: 'الحساب', signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', signUp: 'إنشاء حساب',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', legal: 'قانوني', privacyPolicy: 'سياسة الخصوصية',
    termsOfService: 'شروط الاستخدام', creator: 'المبتكر',
    askAnything: 'كيف يمكنني مساعدتك اليوم؟', send: 'إرسال',
    newChat: 'محادثة جديدة', tools: 'الأدوات', close: 'إغلاق',
    messageNexus: 'راسل Nexus...',
    emptyTitleGuest: 'بمَ يمكن لـ',
    emptyTitleUser: 'مرحبًا',
    emptyHelp: 'اسأل أي شيء، أنشئ شيئًا، أو كلِف Nexus بمهمة.',
    suggestResearch: 'ابحث عن شيء',
    suggestResearchSub: 'تعمّق في أي موضوع',
    suggestAnalyze: 'حلل ملفًا',
    suggestAnalyzeSub: 'ملفات PDF والمستندات والكود',
    suggestCreate: 'أنشئ شيئًا',
    suggestCreateSub: 'الصور والفيديو والكتابة',
    suggestCode: 'ساعدني في البرمجة',
    suggestCodeSub: 'اكتب أو صحح أو اشرح',
    intel: 'الذكاء', intelAuto: 'تلقائي', intelFast: 'سريع',
    intelReasoning: 'استدلال', intelVision: 'رؤية',
    intelAutoDesc: 'أفضل نموذج للمهمة',
    intelFastDesc: 'محادثات يومية سريعة',
    intelReasoningDesc: 'تحليل معقّد ومشاكل صعبة',
    intelVisionDesc: 'الصور والفهم البصري',
    personalization: 'التخصيص',
    emailApps: 'البريد والتطبيقات', theme: 'السمة', rerunOnboarding: 'إعادة التهيئة',
    yourInterests: 'اهتماماتك', memberSince: 'عضو منذ',
    style: 'أسلوب', guestMode: 'وضع الضيف', editProfile: 'تعديل الملف',
    allSystemsOperational: 'كل الأنظمة تعمل', version: 'إصدار 1.0',
    privacy: 'الخصوصية', terms: 'الشروط',
  },
} as const

export type Locale = keyof typeof t
export type TranslationKey = keyof (typeof t)['en']
