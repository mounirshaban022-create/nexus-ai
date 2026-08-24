'use client'

import { useEffect, useRef } from 'react'
import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  name: string
  interests: string[]
  commStyle: string
  createdAt?: string
  updatedAt?: string
  // Task 3/4 extended profile fields
  avatarUrl?: string | null
  bio?: string | null
  location?: string | null
  timezone?: string | null
  language: string
  jobTitle?: string | null
  website?: string | null
  notifications: boolean
  emailVerified: boolean
  lastActiveAt?: string | null
}

/** Shape accepted by updateProfile — all fields optional. */
export type ProfilePatch = Partial<{
  name: string
  bio: string
  location: string
  timezone: string
  language: 'en' | 'ar'
  jobTitle: string
  website: string
  notifications: boolean
  interests: string[]
  commStyle: 'concise' | 'balanced' | 'detailed' | 'friendly'
}>

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
  fetchMe: () => Promise<void>
  signIn: (email: string, password: string) => Promise<AuthUser>
  signUp: (input: { email: string; password: string; name?: string }) => Promise<AuthUser>
  signOut: () => Promise<void>
  clearError: () => void
  updateProfile: (patch: ProfilePatch) => Promise<AuthUser>
  uploadAvatar: (file: File) => Promise<string>
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // ignore JSON parse errors — a non-JSON body is treated as failure below
  }
  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'Request failed'
    const err = new Error(message) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data as T
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,

  fetchMe: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api<{ user: AuthUser | null }>('/api/auth/me', { method: 'GET' })
      set({ user: data.user, loading: false })
    } catch {
      // being signed-out is a normal state — don't surface this as an error
      set({ loading: false, user: null })
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const data = await api<{ user: AuthUser }>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      set({ user: data.user, loading: false })
      return data.user
    } catch (e) {
      let message = e instanceof Error ? e.message : 'Sign in failed'
      // Human-friendly messages for network-level failures
      if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) {
        message = 'Cannot reach the server — check your connection and try again.'
      }
      set({ loading: false, error: message })
      throw new Error(message)
    }
  },

  signUp: async ({ email, password, name }) => {
    set({ loading: true, error: null })
    try {
      const data = await api<{ user: AuthUser }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      })
      set({ user: data.user, loading: false })
      return data.user
    } catch (e) {
      let message = e instanceof Error ? e.message : 'Sign up failed'
      if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) {
        message = 'Cannot reach the server — check your connection and try again.'
      }
      set({ loading: false, error: message })
      throw new Error(message)
    }
  },

  signOut: async () => {
    set({ loading: true, error: null })
    try {
      await api<{ ok: boolean }>('/api/auth/signout', { method: 'POST' })
      set({ user: null, loading: false })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign out failed'
      set({ loading: false, error: message })
      throw e
    }
  },

  clearError: () => set({ error: null }),

  updateProfile: async (patch) => {
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(errBody.error ?? 'Update failed')
    }
    const data = (await res.json()) as { user: AuthUser }
    set({ user: data.user })
    return data.user
  },

  uploadAvatar: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/user/avatar', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(errBody.error ?? 'Upload failed')
    }
    const data = (await res.json()) as { avatarUrl: string }
    const current = get().user
    if (current) {
      set({ user: { ...current, avatarUrl: data.avatarUrl } })
    }
    return data.avatarUrl
  },
}))

// Module-level flag so we only kick off /me once per tab.
let fetchedOnce = false

/**
 * Convenience hook. On first consumer mount, lazy-fetches /api/auth/me
 * to hydrate the user. Returns the same store actions + state.
 */
export function useAuth(): AuthState {
  const store = useAuthStore()
  const mountedRef = useRef(false)

  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    if (!fetchedOnce) {
      fetchedOnce = true
      void store.fetchMe()
    }
  }, [store])

  return store
}
