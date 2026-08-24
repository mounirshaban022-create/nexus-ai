'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Pencil,
  Loader2,
  Check,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useAuth, type ProfilePatch } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import type { CommStyle, Interest } from '@/lib/preferences'

// ============ CONSTANTS ============

// Re-defined here because onboarding.tsx doesn't export INTERESTS / STYLES.
const INTERESTS: Array<{ id: Interest; label: string }> = [
  { id: 'writing', label: 'Writing' },
  { id: 'coding', label: 'Coding' },
  { id: 'research', label: 'Research' },
  { id: 'design', label: 'Design' },
  { id: 'business', label: 'Business' },
  { id: 'learning', label: 'Learning' },
  { id: 'creative', label: 'Creative' },
  { id: 'productivity', label: 'Productivity' },
]

const STYLES: Array<{ id: CommStyle; label: string; desc: string; icon: LucideIcon }> = [
  { id: 'concise', label: 'Concise', desc: 'Short, to-the-point', icon: Sparkles },
  { id: 'balanced', label: 'Balanced', desc: 'Default depth', icon: Sparkles },
  { id: 'detailed', label: 'Detailed', desc: 'In-depth answers', icon: Sparkles },
  { id: 'friendly', label: 'Friendly', desc: 'Warm & casual', icon: Sparkles },
]

const TIMEZONES: string[] = [
  'UTC',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Hong_Kong',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'America/Toronto',
  'Australia/Sydney',
  'Pacific/Auckland',
]

const MAX_INTERESTS = 12
const BIO_MAX = 500
const NAME_MAX = 80
const LOCATION_MAX = 120
const JOB_MAX = 100
const WEBSITE_MAX = 200

// ============ COMPONENT ============

export function ProfileEditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateProfile, uploadAvatar } = useAuth()
  const { toast } = useToast()

  // Form state — initialized from the user record when the modal opens.
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [language, setLanguage] = useState<'en' | 'ar'>('en')
  const [jobTitle, setJobTitle] = useState('')
  const [website, setWebsite] = useState('')
  const [interests, setInterests] = useState<Interest[]>([])
  const [commStyle, setCommStyle] = useState<CommStyle>('balanced')
  const [notifications, setNotifications] = useState(true)

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Prefill from the user record whenever the modal is opened.
  useEffect(() => {
    if (!open || !user) return
    setName(user.name ?? '')
    setBio(user.bio ?? '')
    setLocation(user.location ?? '')
    setTimezone(user.timezone && user.timezone.length > 0 ? user.timezone : 'UTC')
    setLanguage((user.language as 'en' | 'ar') ?? 'en')
    setJobTitle(user.jobTitle ?? '')
    setWebsite(user.website ?? '')
    setInterests(((user.interests ?? []) as Interest[]).slice(0, MAX_INTERESTS))
    setCommStyle((user.commStyle as CommStyle) ?? 'balanced')
    setNotifications(user.notifications ?? true)
  }, [open, user])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // ESC closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const toggleInterest = (id: Interest) => {
    setInterests(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : prev.length >= MAX_INTERESTS
          ? prev
          : [...prev, id],
    )
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Please choose an image under 2 MB.', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      await uploadAvatar(file)
      toast({ title: 'Avatar updated', description: 'Your new profile picture is live.' })
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message ?? 'Please try again.', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    const patch: ProfilePatch = {
      name: name.trim().slice(0, NAME_MAX),
      bio: bio.slice(0, BIO_MAX),
      location: location.trim().slice(0, LOCATION_MAX),
      timezone,
      language,
      jobTitle: jobTitle.trim().slice(0, JOB_MAX),
      website: website.trim().slice(0, WEBSITE_MAX),
      interests: interests.slice(0, MAX_INTERESTS),
      commStyle,
      notifications,
    }
    setSaving(true)
    try {
      await updateProfile(patch)
      toast({ title: 'Profile saved', description: 'Your changes are live.' })
      onClose()
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message ?? 'Please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const displayName = user?.name || user?.email?.split('@')[0] || 'Guest'
  const displayInitial = (user?.name?.[0] || user?.email?.[0] || 'G').toUpperCase()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
        >
          <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Edit profile</h2>
                <p className="text-xs text-muted-foreground">Update your details and preferences</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 transition hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Body — scrollable */}
            <div className="omni-scroll flex-1 overflow-y-auto px-5 py-6">
              {/* Avatar */}
              <section className="mb-6 flex flex-col items-center">
                <div className="relative">
                  {user?.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={displayName}
                      width={80}
                      height={80}
                      className="h-20 w-20 rounded-full border-2 border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border bg-gradient-to-br from-orange-500 to-rose-500 text-xl font-bold text-white">
                      {displayInitial}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    aria-label="Change avatar"
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background shadow-sm transition hover:bg-secondary disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">PNG, JPEG, or WebP · max 2 MB</p>
              </section>

              {/* Name */}
              <div className="mb-4">
                <Label htmlFor="pe-name" className="mb-1.5 block text-sm font-medium">Name</Label>
                <Input id="pe-name" value={name} maxLength={NAME_MAX} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>

              {/* Bio */}
              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <Label htmlFor="pe-bio" className="text-sm font-medium">Bio</Label>
                  <span className={`text-[11px] ${bio.length > BIO_MAX ? 'text-destructive' : 'text-muted-foreground'}`}>{bio.length}/{BIO_MAX}</span>
                </div>
                <Textarea id="pe-bio" value={bio} onChange={e => setBio(e.target.value.slice(0, BIO_MAX))} rows={3} placeholder="A short bio" className="resize-none" />
              </div>

              {/* Location */}
              <div className="mb-4">
                <Label htmlFor="pe-location" className="mb-1.5 block text-sm font-medium">Location</Label>
                <Input id="pe-location" value={location} maxLength={LOCATION_MAX} onChange={e => setLocation(e.target.value)} placeholder="City, Country" />
              </div>

              {/* Timezone */}
              <div className="mb-4">
                <Label className="mb-1.5 block text-sm font-medium">Timezone</Label>
                <Select value={timezone} onValueChange={v => setTimezone(v)}>
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

              {/* Language */}
              <div className="mb-4">
                <Label className="mb-1.5 block text-sm font-medium">Language</Label>
                <Select value={language} onValueChange={v => setLanguage(v as 'en' | 'ar')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Job title */}
              <div className="mb-4">
                <Label htmlFor="pe-job" className="mb-1.5 block text-sm font-medium">Job title</Label>
                <Input id="pe-job" value={jobTitle} maxLength={JOB_MAX} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Product Designer" />
              </div>

              {/* Website */}
              <div className="mb-4">
                <Label htmlFor="pe-website" className="mb-1.5 block text-sm font-medium">Website</Label>
                <Input id="pe-website" value={website} maxLength={WEBSITE_MAX} onChange={e => setWebsite(e.target.value)} placeholder="https://" />
              </div>

              {/* Interests */}
              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-sm font-medium">Interests</Label>
                  <span className="text-[11px] text-muted-foreground">{interests.length}/{MAX_INTERESTS}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INTERESTS.map(it => {
                    const on = interests.includes(it.id)
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggleInterest(it.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
                      >
                        {it.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Communication style */}
              <div className="mb-4">
                <Label className="mb-1.5 block text-sm font-medium">Communication style</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STYLES.map(s => {
                    const on = commStyle === s.id
                    const StyleIcon = s.icon
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCommStyle(s.id)}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition ${on ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                          <StyleIcon className={`h-3.5 w-3.5 ${on ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
                          {s.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notifications */}
              <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card p-3">
                <div className="pr-3">
                  <p className="text-sm font-medium">Product &amp; update emails</p>
                  <p className="text-[11px] text-muted-foreground">Occasional news and feature announcements.</p>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} aria-label="Toggle product and update emails" />
              </div>
            </div>

            {/* Footer */}
            <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSave} disabled={saving || uploading} className="rounded-xl">
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                Save
              </Button>
            </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
