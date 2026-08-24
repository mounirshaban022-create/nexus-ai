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
        }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
      toggleLanguage: () => set((s) => ({ language: s.language === 'en' ? 'ar' : 'en' })),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'nexus-preferences' }
  )
)

/** Applies theme + language to the document element. Call on change. */
export function applyPreferences(theme: string, language: string) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = language
}

// ===== Translations =====
export const t = {
  en: {
    chat: 'Chat', voice: 'Voice', agent: 'Agent', search: 'Search', more: 'More',
    settings: 'Settings', profile: 'Profile', appearance: 'Appearance',
    language: 'Language', light: 'Light', dark: 'Dark', english: 'English', arabic: 'العربية',
    account: 'Account', signIn: 'Sign in', signOut: 'Sign out', signUp: 'Create account',
    email: 'Email', password: 'Password', legal: 'Legal', privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service', creator: 'Creator',
    askAnything: 'How can I help you today?', send: 'Send',
  },
  ar: {
    chat: 'محادثة', voice: 'صوت', agent: 'وكيل', search: 'بحث', more: 'المزيد',
    settings: 'الإعدادات', profile: 'الملف الشخصي', appearance: 'المظهر',
    language: 'اللغة', light: 'فاتح', dark: 'داكن', english: 'English', arabic: 'العربية',
    account: 'الحساب', signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', signUp: 'إنشاء حساب',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', legal: 'قانوني', privacyPolicy: 'سياسة الخصوصية',
    termsOfService: 'شروط الاستخدام', creator: 'المبتكر',
    askAnything: 'كيف يمكنني مساعدتك اليوم؟', send: 'إرسال',
  },
} as const

export type Locale = keyof typeof t
