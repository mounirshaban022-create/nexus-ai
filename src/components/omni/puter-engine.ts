'use client'

/**
 * Puter.js integration — FREE UNLIMITED AI, no API keys.
 * 507 models including GPT-5, Claude, DeepSeek, Qwen3.5, GLM.
 * User signs in once (free account) via popup, then unlimited usage.
 * From the free-ai-apis repo: https://github.com/OuterSpacee/free-ai-apis
 */

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (prompt: string, opts?: { model?: string }) => Promise<unknown>
        listModels: () => Promise<Array<{ id: string; name?: string }>>
      }
      auth: {
        signIn: () => Promise<unknown>
        isSignedIn: () => boolean
      }
    }
  }
}

let scriptLoaded = false
let signedInChecked = false

/** Returns true if the user has completed Puter sign-in (persists across sessions). */
export async function isPuterReady(): Promise<boolean> {
  const loaded = await loadPuter()
  if (!loaded) return false
  if (!signedInChecked) {
    signedInChecked = true
  }
  try {
    return window.puter?.auth?.isSignedIn?.() ?? false
  } catch {
    return false
  }
}

/** Signs in and returns success. One-time — session persists. */
export async function puterSignIn(): Promise<boolean> {
  const loaded = await loadPuter()
  if (!loaded) return false
  try {
    await window.puter?.auth?.signIn()
    return window.puter?.auth?.isSignedIn?.() ?? false
  } catch {
    return false
  }
}

export async function loadPuter(): Promise<boolean> {
  if (scriptLoaded && window.puter) return true
  try {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[src*="js.puter.com"]')
      if (existing) {
        scriptLoaded = true
        resolve()
        return
      }
      const s = document.createElement('script')
      s.src = 'https://js.puter.com/v2/'
      s.onload = () => {
        scriptLoaded = true
        resolve()
      }
      s.onerror = () => reject(new Error('Failed to load Puter'))
      document.head.appendChild(s)
    })
    // Wait for puter to initialize — poll quickly instead of fixed delay
    for (let i = 0; i < 60; i++) {
      if (window.puter?.ai?.chat) return true
      await new Promise((r) => setTimeout(r, 50))
    }
    return Boolean(window.puter?.ai?.chat)
  } catch {
    return false
  }
}

export async function puterChat(
  prompt: string,
  model = 'gpt-5-nano'
): Promise<{ ok: boolean; text: string; needsAuth?: boolean }> {
  const loaded = await loadPuter()
  if (!loaded) return { ok: false, text: 'Puter unavailable' }

  try {
    const resp = await window.puter!.ai.chat(prompt, { model })
    const text =
      typeof resp === 'string'
        ? resp
        : ((resp as any)?.message?.content?.[0]?.text ??
          (resp as any)?.text ??
          JSON.stringify(resp))
    return { ok: true, text: String(text) }
  } catch (e: unknown) {
    const errStr = JSON.stringify(e) || String(e)
    if (errStr.includes('auth')) {
      return { ok: false, text: 'Sign in required', needsAuth: true }
    }
    return { ok: false, text: 'Puter error: ' + errStr.slice(0, 100) }
  }
}

