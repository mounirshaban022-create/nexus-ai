# Task 6 — Onboarding enhance (7-step + server sync)

**Agent:** full-stack-developer (onboarding enhance)
**Task:** Enhance `src/components/omni/onboarding.tsx` from a 5-step local-only flow into a 7-step richer flow that optionally signs the user up inline (step 2) and best-effort-syncs the full profile (bio/location/timezone/interests/commStyle/avatar) to the server when finishing. Extend `src/lib/preferences.ts` to mirror the new bio/location/timezone/avatarUrl fields locally.

## Files Changed

- **Modified** `src/lib/preferences.ts` — added `bio`, `location`, `timezone`, `avatarUrl` to PreferencesState (all `string`, default `''`); extended `completeOnboarding` to accept optional `bio`/`location`/`timezone`/`avatarUrl` and persist them; extended `resetOnboarding` to clear them. Existing fields and behavior untouched.
- **Modified** `src/components/omni/onboarding.tsx` — full rewrite from 5 steps to 7 steps. Reuses existing `INTERESTS` + `STYLES` arrays and existing visual language (warm gradient hero, framer-motion step transitions, `nexus-ambient` wrapper, pill Back/Continue buttons, safe-area footer). Adds new imports: `useAuth` (`signUp`/`updateProfile`/`uploadAvatar`), `useToast`, shadcn `Input`/`Textarea`/`Label`/`Checkbox`/`Select`, and lucide `Upload`/`X`/`Loader2`. Added optional `onComplete?: () => void` prop (no-op default — keeps existing `<Onboarding />` usage in page.tsx working).

## New 7-step flow

1. **Welcome** — unchanged hero + tagline.
2. **Account** (NEW) — Email/Password/Name inputs + "Skip — continue as guest" link. Inline validation matching the Task-4 API zod schema (email regex; password min 8 + ≥1 letter + ≥1 digit; name required only if signing up). Continue does `await signUp({email,password,name})` only when all 3 fields are validly filled; on failure shows inline error and stays on step (user can fix and retry, or click Skip). If only name is filled (no email/pwd), Continue proceeds as guest with that name. If all empty, Continue proceeds as guest with empty name. `didSignUp` state tracks whether signUp succeeded in this session.
3. **Interests** — unchanged multi-select chips.
4. **Communication style** — unchanged 4 options.
5. **About you** (NEW) — Name (prefilled from step 2's `name` state), Bio (Textarea, max 500 with live counter), Location (Input, max 120), Timezone (Select with 12 IANA zones). All optional.
6. **Avatar** (NEW) — click-to-upload circle with hidden `<input type="file" accept="image/png,image/jpeg,image/webp">`. Plain `<img>` preview via `URL.createObjectURL(blob)`. Validates MIME + 2MB cap (toasts on invalid). Remove button when a file is selected. Continue always enabled (optional). File stored in component state — NOT uploaded yet.
7. **Legal consent** (NEW) — two Checkboxes (Privacy Policy + Terms of Service). Each label is a `<button>` that dispatches `window.dispatchEvent(new CustomEvent('nexus:open-legal', { detail: { type: 'privacy'|'terms' } }))` with `preventDefault`+`stopPropagation` so it doesn't toggle the checkbox. Enter Nexus button disabled until BOTH checkboxes are checked. Shows a small "Continuing as a guest — your data stays on this device." note when `!didSignUp`.

## Key code blocks

### preferences.ts — extended state + completeOnboarding

```ts
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
  // ... appearance actions
}
```

```ts
completeOnboarding: ({ name, interests, commStyle, bio, location, timezone, avatarUrl }) =>
  set({
    name, interests, commStyle,
    bio: bio ?? '',
    location: location ?? '',
    timezone: timezone ?? '',
    avatarUrl: avatarUrl ?? '',
    onboarded: true,
  }),
resetOnboarding: () =>
  set({
    onboarded: false, name: '', interests: [], commStyle: 'balanced',
    bio: '', location: '', timezone: '', avatarUrl: '',
  }),
```

### onboarding.tsx — legal-consent row (link dispatches event, doesn't toggle checkbox)

```tsx
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
```

```ts
const openLegal = (type: 'privacy' | 'terms') => (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  window.dispatchEvent(
    new CustomEvent('nexus:open-legal', { detail: { type } })
  )
}
```

### onboarding.tsx — final finish() (best-effort server sync, never blocks)

```ts
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
    // Only attempt avatar upload if profile patch succeeded.
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

  // Always persist locally — this flips onboarded:true and triggers the
  // parent swap to NexusApp. Called BEFORE the toast so the swap isn't blocked.
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
```

### onboarding.tsx — step-2 handleAccountContinue (inline signup, guest fallback)

```ts
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
```

Where `wantsSignup = email.trim().length > 0 || password.length > 0` and `accountCanSignup = emailValid && pwdValid && name.trim().length > 0`, so Continue is enabled when the user is either guest-like (no email/pwd entered) OR fully-valid-signup. The "in-between" partial state disables Continue and shows a "Fill all fields to create an account — or skip below." hint.

## Per-step Continue gate

```ts
const canContinue = (() => {
  switch (step) {
    case 1: return accountCanContinue && !signingUp
    case 6: return legalReady && !finishing
    default: return true
  }
})()
```

All intermediate steps (Welcome, Interests, CommStyle, About you, Avatar) have Continue always enabled — they're 100% local, no blocking awaits. Only step 2 (signUp) and step 7 (final sync) block, and both show a `Loader2` spinner inside the primary button while waiting.

## Lint status

`cd /home/z/my-project && bun run lint` → **exit 0, 0 errors, 0 warnings.**

## Constraints honored

- ONLY edited `src/components/omni/onboarding.tsx` and `src/lib/preferences.ts`.
- Did NOT touch `src/app/page.tsx`, `src/hooks/use-auth.ts`, `prisma/schema.prisma`, or any API route.
- Did NOT run `bun run build`.
- Reused existing `INTERESTS` + `STYLES` arrays (no duplication).
- Used `useAuth()` from `@/hooks/use-auth` for `signUp`/`updateProfile`/`uploadAvatar`.
- Used `useToast()` from `@/hooks/use-toast` for non-blocking feedback.
- Used shadcn `Input`/`Textarea`/`Select`/`Label`/`Checkbox` (Checkbox from `@/components/ui/checkbox`).
- Kept the existing visual style of onboarding.tsx (warm gradient hero, framer-motion step transitions, `nexus-ambient` class, step counter, Back/Continue pill buttons, safe-area footer).
- The flow remains smooth — no blocking awaits except the final sync (and the step-2 signUp which is opt-in and shows a spinner).
