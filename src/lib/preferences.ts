'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PreferencesState {
  theme: 'light' | 'dark'
  language: 'en' | 'ar'
  toggleTheme: () => void
  setTheme: (t: 'light' | 'dark') => void
  toggleLanguage: () => void
  setLanguage: (l: 'en' | 'ar') => void
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'light',
      language: 'en',
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
