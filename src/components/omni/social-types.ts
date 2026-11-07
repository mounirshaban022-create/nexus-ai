/**
 * Shared view-model types for the Social Pilot surfaces
 * (social-mode + social-brain + social-inbox).
 */

export type SocialPlatformView = 'instagram' | 'linkedin' | 'x' | 'facebook'

export interface PageStrategyView {
  voice: string
  pillars: string[]
  hooks: string[]
  dos: string[]
  donts: string[]
  hashtags: string[]
}

export interface TrendBrainView {
  summary: string
  topics: string[]
  hooks: string[]
  formats: string[]
  hashtags: string[]
  sources: { title: string; url: string }[]
  fetchedAt: string
  researched: boolean
}

export interface SocialAccountView {
  id: string
  platform: SocialPlatformView
  platformLabel: string
  displayName: string
  handle: string
  autopilot: boolean
  autopilotTopic: string
  autopilotCadenceMinutes: number
  lastAutoPostAt: string | null
  // page brain
  pageNiche: string
  pageAudience: string
  pageTone: string
  pageGoal: string
  pageLanguage: string
  strategy: PageStrategyView | null
  trends: TrendBrainView | null
  // engagement
  autoReply: boolean
  status: string
  statusMessage: string
  tokenPreview: string
}

export interface SocialCommentView {
  id: string
  accountId: string
  platform: string
  author: string
  text: string
  sentiment: string
  aiReply: string
  status: string
  createdAt: string
  repliedAt: string | null
}
