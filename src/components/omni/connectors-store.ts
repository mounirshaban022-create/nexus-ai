'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** All connectors enabled by default — users can toggle in the Connectors hub. */
const DEFAULT_ENABLED = [
  // web & data
  'web_search',
  'read_page',
  'wikipedia',
  'weather',
  'forecast',
  'space',
  // knowledge
  'dictionary',
  'translate',
  'research',
  // finance
  'crypto',
  'currency',
  // developer
  'hacker_news',
  'github',
  // utility
  'time',
  'calculator',
  'generate_image',
  'geocode',
  // knowledge & humanities
  'worldbank',
  'poetry',
  'bible',
  // fun & loved
  'recipes',
  'nasa',
  'pokemon',
  'trivia',
  'games',
  'news',
  // email (real account actions)
  'email_list',
  'email_search',
  'email_read',
  'email_send',
]

interface ConnectorsState {
  enabled: string[]
  toggle: (id: string) => void
  enableAll: () => void
  disableAll: () => void
  setEnabled: (ids: string[]) => void
  isEnabled: (id: string) => boolean
}

export const useConnectorsStore = create<ConnectorsState>()(
  persist(
    (set, get) => ({
      enabled: DEFAULT_ENABLED,
      toggle: (id) =>
        set((s) => ({
          enabled: s.enabled.includes(id)
            ? s.enabled.filter((c) => c !== id)
            : [...s.enabled, id],
        })),
      enableAll: () => set({ enabled: [...DEFAULT_ENABLED] }),
      disableAll: () => set({ enabled: [] }),
      setEnabled: (ids) => set({ enabled: ids }),
      isEnabled: (id) => get().enabled.includes(id),
    }),
    {
      name: 'nexus-connectors-v2',
      version: 2,
      migrate: (state) => ({ ...(state as Record<string, unknown>), enabled: [...DEFAULT_ENABLED] }),
    }
  )
)

export { DEFAULT_ENABLED }
