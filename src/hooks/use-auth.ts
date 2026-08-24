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
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
  fetchMe: () => Promise<void>
  signIn: (email: string, password: string) => Promise<AuthUser>
  signUp: (input: { email: string; password: string; name?: string }) => Promise<AuthUser>
  signOut: () => Promise<void>
  clearError: () => void
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

export const useAuthStore = create<AuthState>((set) => ({
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
      const message = e instanceof Error ? e.message : 'Sign in failed'
      set({ loading: false, error: message })
      throw e
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
      const message = e instanceof Error ? e.message : 'Sign up failed'
      set({ loading: false, error: message })
      throw e
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
