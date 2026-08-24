'use client'

import { useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  PenLine,
  Code2,
  Search,
  Palette,
  Briefcase,
  GraduationCap,
  Wand2,
  Zap,
  MessageCircle,
  FileText,
  Upload,
  X,
  Loader2,
} from 'lucide-react'
import { usePreferences, type CommStyle, type Interest } from '@/lib/preferences'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const INTERESTS: Array<{ id: Interest; label: string; icon: any; desc: string }> = [
  { id: 'writing', label: 'Writing', icon: PenLine, desc: 'Essays, emails, stories' },
  { id: 'coding', label: 'Coding', icon: Code2, desc: 'Code, debug, explain' },
  { id: 'research', label: 'Research', icon: Search, desc: 'Deep dive into topics' },
  { id: 'design', label: 'Design', icon: Palette, desc: 'Visuals & concepts' },
  { id: 'business', label: 'Business', icon: Briefcase, desc: 'Strategy & ops' },
  { id: 'learning', label: 'Learning', icon: GraduationCap, desc: 'Explore new ideas' },
  { id: 'creative', label: 'Creative', icon: Wand2, desc: 'Brainstorm & imagine' },
  { id: 'productivity', label: 'Productivity', icon: Zap, desc: 'Get things done' },
]

const STYLES: Array<{ id: CommStyle; label: string; desc: string; icon: any }> = [
  { id: 'concise', label: 'Concise', desc: 'Short, to the point', icon: Zap },
  { id: 'balanced', label: 'Balanced', desc: 'Clear and complete', icon: Sparkles },
  { id: 'detailed', label: 'Detailed', desc: 'Thorough and deep', icon: FileText },
  { id: 'friendly', label: 'Friendly', desc: 'Warm and conversational', icon: MessageCircle },
]

const TIMEZONES = [
  'UTC',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
]

const TOTAL_STEPS = 7
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
// For guest mode only — local data URLs are kept tiny to avoid bloating localStorage.
const GUEST_AVATAR_DATAURL_MAX_BYTES = 200 * 1024

function passwordValid(p: string) {
  return p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const { completeOnboarding } = usePreferences()
  const { signUp, updateProfile, uploadAvatar } = useAuth()
  const { toast } = useToast()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [interests, setInterests] = useState<Interest[]>([])
  const [style, setStyle] = useState<CommStyle>('balanced')

  // Step 2 (Account)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingUp, setSigningUp] = useState(false)
  const [signUpError, setSignUpError] = useState<string | null>(null)
  const [didSignUp, setDidSignUp] = useState(false)

  // Step 5 (About you)
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [timezone, setTimezone] = useState('')

  // Step 6 (Avatar)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 7 (Legal consent)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const finishedRef = useRef(false)

  const toggleInterest = (id: Interest) =>
    setInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const next = () => setStep(s => Math.min(TOTAL_STEPS - 1, s + 1))
  const back = () => setStep(s => Math.max(0, s - 1))

  // ---- Step 2 (Account) inline validation ----
  const emailValid = EMAIL_RE.test(email.trim())
  const pwdValid = passwordValid(password)
  const wantsSignup = email.trim().length > 0 || password.length > 0
  const accountCanSignup = emailValid && pwdValid && name.trim().length > 0
  // Continue enabled when guest (no email/pwd) OR fully-valid signup
  const accountCanContinue = !wantsSignup || accountCanSignup
  const accountPartial = wantsSignup && !accountCanSignup

  const handleAccountContinue = async () => {
    if (signingUp || !accountCanContinue) return
    setSignUpError(null)
    if (!wantsSignup) {
      // Proceed as guest — name (if any) is already in state.
      next()
      return
    }
    setSigningUp(true)
    try {
      await signUp({ email: email.trim(), password, name: name.trim() })
      setDidSignUp(true)
      next()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign up failed'
      setSignUpError(msg)
      // Stay on this step — user can fix inputs and retry, or click Skip below.
    } finally {
      setSigningUp(false)
    }
  }

  const handleSkipAccount = () => {
    if (signingUp) return
    setSignUpError(null)
    next()
  }

  // ---- Step 6 (Avatar) ----
  const onAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      toast({ title: 'Unsupported image', description: 'Choose PNG, JPEG, or WebP.' })
      return
    }
    if (f.size > AVATAR_MAX_BYTES) {
      toast({ title: 'Image too large', description: 'Max size is 2MB.' })
      return
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(f)
    setAvatarPreview(URL.createObjectURL(f))
  }

  const clearAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(null)
    setAvatarPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---- Step 7 (Legal consent) ----
  const openLegal = (type: 'privacy' | 'terms') => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.dispatchEvent(
      new CustomEvent('nexus:open-legal', { detail: { type } })
    )
  }

  const legalReady = agreePrivacy && agreeTerms

  // ---- Final sync (called from step 7's Enter Nexus button) ----
  const finish = async () => {
    if (finishedRef.current) return
    finishedRef.current = true
    setFinishing(true)

    const trimmedName = name.trim()
    const trimmedBio = bio.trim()
    const trimmedLocation = location.trim()

    // Sync to server only when the user signed up in step 2.
    let syncFailed = false
    if (didSignUp) {
      try {
        await updateProfile({
          name: trimmedName,
          bio: trimmedBio || undefined,
          location: trimmedLocation || undefined,
          timezone: timezone || undefined,
          interests,
          commStyle: style,
          language: 'en',
        })
      } catch {
        syncFailed = true
      }
      // Only attempt avatar upload if profile patch succeeded — otherwise skip
      // (the user isn't fully synced, no point partial-syncing the avatar).
      if (avatarFile && !syncFailed) {
        try {
          await uploadAvatar(avatarFile)
        } catch {
          syncFailed = true
        }
      }
    }

    // Guest avatar: best-effort local data URL (size-capped to protect localStorage).
    let guestAvatarUrl: string | undefined
    if (!didSignUp && avatarFile && avatarFile.size <= GUEST_AVATAR_DATAURL_MAX_BYTES) {
      try {
        guestAvatarUrl = await fileToDataUrl(avatarFile)
      } catch {
        // ignore — just skip the local avatar
      }
    }

    // Release the in-memory preview URL.
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)

    // Always persist locally — this flips `onboarded: true` and triggers the
    // parent swap to NexusApp. Call before the toast so the swap isn't blocked.
    completeOnboarding({
      name: trimmedName,
      interests,
      commStyle: style,
      bio: trimmedBio || undefined,
      location: trimmedLocation || undefined,
      timezone: timezone || undefined,
      avatarUrl: guestAvatarUrl,
    })

    if (syncFailed) {
      toast({
        title: 'Profile saved locally',
        description: 'Sign in later to sync your profile to the cloud.',
      })
    }

    onComplete?.()
  }

  // Per-step Continue gate (also drives the disabled state of the primary button).
  const canContinue = (() => {
    switch (step) {
      case 1: return accountCanContinue && !signingUp
      case 6: return legalReady && !finishing
      default: return true
    }
  })()

  const handleContinue = () => {
    if (step === 1) { void handleAccountContinue(); return }
    if (step === 6) { void finish(); return }
    next()
  }

  const isLast = step === TOTAL_STEPS - 1
  const busy = (signingUp && step === 1) || (finishing && step === 6)

  return (
    <div className="nexus-ambient flex min-h-dvh flex-col bg-background">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 pt-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${i === step ? 'w-7 bg-primary' : i < step ? 'w-1.5 bg-primary/60' : 'w-1.5 bg-border'}`}
          />
        ))}
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-6">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* STEP 1: Welcome */}
            {step === 0 && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 120, damping: 16 }}
                  className="relative mx-auto mb-7"
                >
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative"
                  >
                    <Image
                      src="/nexus-onboarding-hero.png"
                      alt="Nexus"
                      width={220}
                      height={147}
                      priority
                      className="h-36 w-auto rounded-2xl shadow-2xl shadow-primary/20 ring-1 ring-border/50"
                    />
                  </motion.div>
                  <motion.span
                    aria-hidden
                    className="absolute -inset-3 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 via-rose-500/10 to-transparent blur-2xl"
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.div>
                <h1 className="text-3xl font-semibold tracking-tight">Welcome to Nexus</h1>
                <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
                  One assistant for everything you do — research, writing, code, images, and more.
                </p>
              </motion.div>
            )}

            {/* STEP 2: Account (optional inline signup) */}
            {step === 1 && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <h1 className="text-2xl font-semibold tracking-tight text-center">
                  Create your account
                </h1>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Optional — sign up to sync your profile across devices.
                </p>
                <div className="mt-6 space-y-3">
                  <div>
                    <Label htmlFor="ob-email" className="mb-1.5">Email</Label>
                    <Input
                      id="ob-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                    {email.trim() && !emailValid && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Enter a valid email address.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="ob-pwd" className="mb-1.5">Password</Label>
                    <Input
                      id="ob-pwd"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min 8 chars, 1 letter, 1 digit"
                      autoComplete="new-password"
                    />
                    {password && !pwdValid && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Must be 8+ chars with at least one letter and one digit.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="ob-acct-name" className="mb-1.5">Name</Label>
                    <Input
                      id="ob-acct-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                  {accountPartial && (
                    <p className="text-[11px] text-muted-foreground">
                      Fill email, password, and name to create an account — or skip below.
                    </p>
                  )}
                  {signUpError && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                      {signUpError} — fix and retry, or skip to continue as a guest.
                    </p>
                  )}
                </div>
                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={handleSkipAccount}
                    disabled={signingUp}
                    className="text-xs text-muted-foreground underline-offset-2 transition hover:underline disabled:opacity-50"
                  >
                    Skip — continue as guest
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Interests */}
            {step === 2 && (
              <motion.div
                key="interests"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <h1 className="text-2xl font-semibold tracking-tight">What do you want to do?</h1>
                <p className="mt-2 text-sm text-muted-foreground">Pick a few — Nexus will tailor suggestions.</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {INTERESTS.map(it => {
                    const Icon = it.icon
                    const active = interests.includes(it.id)
                    return (
                      <button
                        key={it.id}
                        onClick={() => toggleInterest(it.id)}
                        className={`relative flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
                          active
                            ? 'border-primary bg-primary/8'
                            : 'border-border bg-card hover:bg-secondary'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium">{it.label}</span>
                        <span className="text-[11px] text-muted-foreground">{it.desc}</span>
                        {active && (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  {interests.length === 0 ? 'Skip if you like — Nexus works for everyone.' : `${interests.length} selected`}
                </p>
              </motion.div>
            )}

            {/* STEP 4: Communication Style */}
            {step === 3 && (
              <motion.div
                key="style"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <h1 className="text-2xl font-semibold tracking-tight">How should Nexus talk to you?</h1>
                <p className="mt-2 text-sm text-muted-foreground">Choose the tone that feels right.</p>
                <div className="mt-6 space-y-2">
                  {STYLES.map(s => {
                    const Icon = s.icon
                    const active = style === s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => setStyle(s.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                          active ? 'border-primary bg-primary/8' : 'border-border bg-card hover:bg-secondary'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{s.label}</p>
                          <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                        </div>
                        {active && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 5: About you */}
            {step === 4 && (
              <motion.div
                key="about"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <h1 className="text-2xl font-semibold tracking-tight">Tell us about you</h1>
                <p className="mt-2 text-sm text-muted-foreground">Optional — helps Nexus personalize.</p>
                <div className="mt-6 space-y-3.5">
                  <div>
                    <Label htmlFor="ob-name" className="mb-1.5">Name</Label>
                    <Input
                      id="ob-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ob-bio" className="mb-1.5">Bio</Label>
                    <Textarea
                      id="ob-bio"
                      value={bio}
                      onChange={e => setBio(e.target.value.slice(0, 500))}
                      placeholder="A short bio"
                      rows={3}
                    />
                    <p className="mt-1 text-right text-[11px] text-muted-foreground">{bio.length}/500</p>
                  </div>
                  <div>
                    <Label htmlFor="ob-loc" className="mb-1.5">Location</Label>
                    <Input
                      id="ob-loc"
                      value={location}
                      onChange={e => setLocation(e.target.value.slice(0, 120))}
                      placeholder="City, Country"
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5">Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map(tz => (
                          <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 6: Avatar */}
            {step === 5 && (
              <motion.div
                key="avatar"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center"
              >
                <h1 className="text-2xl font-semibold tracking-tight">Add a photo</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Optional — appears next to your messages.
                </p>
                <div className="mt-8 flex flex-col items-center gap-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload avatar"
                    className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-card transition hover:border-primary/50 hover:bg-secondary"
                  >
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                        <Upload className="h-6 w-6" />
                        <span className="text-[11px]">Click to upload</span>
                      </div>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={onAvatarChange}
                    className="hidden"
                  />
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={clearAvatar}
                      className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                    >
                      <X className="h-3 w-3" /> Remove
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP — max 2MB.</p>
                </div>
              </motion.div>
            )}

            {/* STEP 7: Legal consent */}
            {step === 6 && (
              <motion.div
                key="legal"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center"
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative mx-auto mb-6"
                >
                  <Image
                    src="/nexus-onboarding-hero.png"
                    alt="Nexus"
                    width={180}
                    height={120}
                    className="h-24 w-auto rounded-2xl shadow-xl shadow-primary/15 ring-1 ring-border/50"
                  />
                  <motion.span
                    aria-hidden
                    className="absolute -inset-2 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 to-transparent blur-2xl"
                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.div>
                <h1 className="text-2xl font-semibold tracking-tight">Almost there</h1>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                  Please review and accept our policies to enter Nexus.
                </p>
                <div className="mt-6 space-y-3 text-left">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="ob-privacy"
                      checked={agreePrivacy}
                      onCheckedChange={(c) => setAgreePrivacy(c === true)}
                      className="mt-0.5"
                      aria-label="I agree to the Privacy Policy"
                    />
                    <span className="text-sm leading-relaxed">
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={openLegal('privacy')}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Privacy Policy
                      </button>
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="ob-terms"
                      checked={agreeTerms}
                      onCheckedChange={(c) => setAgreeTerms(c === true)}
                      className="mt-0.5"
                      aria-label="I agree to the Terms of Service"
                    />
                    <span className="text-sm leading-relaxed">
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={openLegal('terms')}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Terms of Service
                      </button>
                    </span>
                  </div>
                </div>
                {!didSignUp && (
                  <p className="mt-5 text-xs text-muted-foreground">
                    Continuing as a guest — your data stays on this device.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer nav */}
      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto flex max-w-md items-center justify-between">
          {step > 0 ? (
            <button
              onClick={back}
              disabled={signingUp || finishing}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <button
              onClick={next}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Skip
            </button>
          )}

          {!isLast ? (
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              {signingUp && step === 1 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                <>Continue <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          ) : (
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              {finishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Entering…
                </>
              ) : (
                <>Enter Nexus <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
