'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronRight,
  FileText,
  Languages,
  LogIn,
  LogOut,
  Mail,
  Moon,
  Palette,
  Shield,
  Sun,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePreferences, applyPreferences } from '@/lib/preferences'
import { isSupabaseConfigured, getCurrentUser, signOut } from '@/lib/supabase'
import { AuthModal } from './auth-modal'
import { LegalPage } from './legal-page'
import { useToast } from '@/hooks/use-toast'

const CREATOR = { name: 'Mounir Shaaban', role: 'Creator & Developer' }

export function SettingsMode() {
  const { toast } = useToast()
  const { theme, language, toggleTheme, toggleLanguage } = usePreferences()
  const [user, setUser] = useState<{ email?: string; id?: string } | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [legalPage, setLegalPage] = useState<'privacy' | 'terms' | null>(null)

  useEffect(() => {
    applyPreferences(theme, language)
  }, [theme, language])

  useEffect(() => {
    if (isSupabaseConfigured) {
      getCurrentUser().then(setUser)
    }
  }, [])

  const L = language === 'ar' ? 'ar' : 'en'
  const labels = {
    settings: L === 'ar' ? 'الإعدادات' : 'Settings',
    profile: L === 'ar' ? 'الملف الشخصي' : 'Profile',
    account: L === 'ar' ? 'الحساب' : 'Account',
    appearance: L === 'ar' ? 'المظهر' : 'Appearance',
    theme: L === 'ar' ? 'السمة' : 'Theme',
    language: L === 'ar' ? 'اللغة' : 'Language',
    light: L === 'ar' ? 'فاتح' : 'Light',
    dark: L === 'ar' ? 'داكن' : 'Dark',
    legal: L === 'ar' ? 'قانوني' : 'Legal',
    privacy: L === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy',
    terms: L === 'ar' ? 'شروط الاستخدام' : 'Terms of Service',
    creator: L === 'ar' ? 'المبتكر' : 'Creator',
    signIn: L === 'ar' ? 'تسجيل الدخول' : 'Sign in',
    signOut: L === 'ar' ? 'تسجيل الخروج' : 'Sign out',
  }

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <h2 className="text-lg font-semibold">{labels.settings}</h2>

        {/* Profile Card */}
        <section className="mt-5 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-lg font-bold text-white">
              {user ? (user.email ?? '?')[0].toUpperCase() : 'M'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold">
                {user ? user.email : L === 'ar' ? 'زائر' : 'Guest'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {user ? (L === 'ar' ? 'عضو مسجل' : 'NEXUS AI member') : (L === 'ar' ? 'سجّل الدخول لمزامنة محادثاتك' : 'Sign in to sync your chats')}
              </p>
            </div>
            {user && <Badge variant="secondary" className="text-xs">✓</Badge>}
          </div>

          {user ? (
            <Button
              onClick={async () => { await signOut(); setUser(null); toast({ title: L === 'ar' ? 'تم تسجيل الخروج' : 'Signed out' }) }}
              variant="outline"
              className="mt-4 w-full gap-2 rounded-xl"
            >
              <LogOut className="h-4 w-4" /> {labels.signOut}
            </Button>
          ) : (
            <Button
              onClick={() => setShowAuth(true)}
              className="mt-4 w-full gap-2 rounded-xl bg-primary text-primary-foreground"
            >
              <LogIn className="h-4 w-4" /> {labels.signIn}
            </Button>
          )}
        </section>

        {/* Appearance */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4" /> {labels.appearance}
          </h4>
          <div className="mt-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {labels.theme}
            </span>
            <button
              onClick={() => { toggleTheme(); toast({ title: theme === 'dark' ? labels.light : labels.dark }) }}
              className={`relative h-8 w-14 rounded-full transition ${theme === 'dark' ? 'bg-primary' : 'bg-secondary'}`}
              aria-label="Toggle theme"
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${theme === 'dark' ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Languages className="h-4 w-4" /> {labels.language}
            </span>
            <div className="flex overflow-hidden rounded-full border border-border">
              <button
                onClick={() => usePreferences.getState().setLanguage('en')}
                className={`px-4 py-1.5 text-sm font-medium transition ${language === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                EN
              </button>
              <button
                onClick={() => usePreferences.getState().setLanguage('ar')}
                className={`px-4 py-1.5 text-sm font-medium transition ${language === 'ar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                عربي
              </button>
            </div>
          </div>
        </section>

        {/* Legal */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4" /> {labels.legal}
          </h4>
          <button
            onClick={() => setLegalPage('privacy')}
            className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition hover:bg-secondary/50"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" /> {labels.privacy}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
          <button
            onClick={() => setLegalPage('terms')}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition hover:bg-secondary/50"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" /> {labels.terms}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        </section>

        {/* Creator */}
        <section className="mt-4 mb-8 rounded-2xl border border-border bg-card p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-base font-bold text-white">
            MS
          </div>
          <h4 className="text-sm font-semibold">{CREATOR.name}</h4>
          <p className="text-xs text-muted-foreground">{CREATOR.role}</p>
          <p className="mt-2 text-[11px] text-muted-foreground/60">NEXUS AI © 2026</p>
        </section>
      </div>

      {showAuth && <AuthModal onClose={() => { setShowAuth(false); getCurrentUser().then(setUser) }} />}
      {legalPage && <LegalPage type={legalPage} onClose={() => setLegalPage(null)} language={language} />}
    </div>
  )
}
