'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderKanban,
  Plus,
  MessageSquare,
  FileText,
  ArrowLeft,
  X,
  Trash2,
  Pencil,
  Save,
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
  Send,
  Settings2,
  RefreshCw,
} from 'lucide-react'

/**
 * Phase 1 — Priority 3: Projects mode UI.
 *
 * Replaces the prior 304-line placeholder that rendered hardcoded seed data
 * with no persistence. This component is now a full CRUD client for the
 * /api/projects endpoints. It supports:
 *
 *   - List view: GET /api/projects, render real projects with live stats
 *     (conversations + files counts) and relative-time. New-project modal
 *     POSTs to /api/projects.
 *   - Detail view: GET /api/projects/[id], three tabs:
 *       Conversations — sessions bound to the project; click "Start new
 *         conversation in this project" → calls onStartProjectChat(projectId,
 *         projectName) which the parent (page.tsx) wires into the chat tab.
 *       Files — list / add / delete reference files. Text content only.
 *       Instructions — edit the project's persistent customInstructions.
 *   - Edit modal: PATCH /api/projects/[id] for name/description/color.
 *   - Delete: confirm → DELETE /api/projects/[id].
 *
 * i18n: EN + AR strings inline. Direction (RTL/LTR) is inherited from the
 * document element which the page sets based on the active language.
 *
 * All operations require an authenticated session cookie. Guests see a
 * sign-in CTA card (mirrors the MemorySection pattern from P1).
 */

// ----- i18n strings -----
const T = {
  en: {
    title: 'Projects',
    subtitle: 'Persistent context for your ongoing work.',
    search: 'Search projects...',
    newProject: 'New',
    noProjects: 'No projects yet',
    noProjectsDesc: 'Create a project to organize conversations, files, and notes.',
    newProjectCta: 'New Project',
    conversations: 'Conversations',
    files: 'Files',
    instructions: 'Instructions',
    nothingHere: 'Nothing here yet',
    nothingHereDesc: 'Start a conversation, add a file, or write instructions.',
    startConversation: 'Start conversation in this project',
    conversationsEmpty: 'No conversations yet',
    conversationsEmptyDesc: 'Start a new chat and NEXUS will use this project as context.',
    backToProjects: 'Projects',
    name: 'Name',
    namePlaceholder: 'e.g. Q1 Marketing',
    description: 'Description (optional)',
    descriptionPlaceholder: "What's this project about?",
    color: 'Color',
    customInstructions: 'Custom instructions',
    customInstructionsPlaceholder:
      'Persistent directives for this project. Example: "Use TypeScript. The audience is the senior eng team. Keep answers concise."',
    customInstructionsHint:
      'These instructions are injected into NEXUS\'s system prompt for every chat in this project.',
    save: 'Save',
    cancel: 'Cancel',
    create: 'Create',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Delete this project?',
    confirmDeleteDesc:
      'The project, its files, and its custom instructions will be removed. Bound conversations keep their history but lose project context.',
    addFile: 'Add file',
    filename: 'Filename',
    filenamePlaceholder: 'e.g. app-config.ts',
    fileContent: 'File content',
    fileContentPlaceholder: 'Paste file content here (text only, max 200KB)...',
    uploadFromDevice: 'Upload from device',
    noFiles: 'No files yet',
    noFilesDesc: 'Add code, configs, or notes — NEXUS will use them as background context for chats in this project.',
    saveInstructions: 'Save instructions',
    instructionsSaved: 'Saved.',
    fileAdded: 'File added.',
    fileDeleted: 'File deleted.',
    projectCreated: 'Project created.',
    projectUpdated: 'Project updated.',
    projectDeleted: 'Project deleted.',
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Retry',
    signInTitle: 'Projects',
    signInCta: 'Sign in to use projects',
    signInDesc:
      'Projects are tied to your account. Sign in to organize conversations, files, and persistent instructions for ongoing work.',
    signIn: 'Sign in',
    signUp: 'Sign up',
    lastActivity: 'Last activity',
    bytes: 'B',
    kilobytes: 'KB',
    megabytes: 'MB',
    newConversation: 'New conversation',
    existingConversation: 'Conversations in this project',
    settings: 'Settings',
    statsConv: 'conversations',
    statsFiles: 'files',
  },
  ar: {
    title: 'المشاريع',
    subtitle: 'سياق دائم لأعمالك الجارية.',
    search: 'ابحث عن المشاريع...',
    newProject: 'جديد',
    noProjects: 'لا توجد مشاريع بعد',
    noProjectsDesc: 'أنشئ مشروعًا لتنظيم المحادثات والملفات والملاحظات.',
    newProjectCta: 'مشروع جديد',
    conversations: 'المحادثات',
    files: 'الملفات',
    instructions: 'التعليمات',
    nothingHere: 'لا شيء هنا بعد',
    nothingHereDesc: 'ابدأ محادثة أو أضف ملفًا أو اكتب تعليمات.',
    startConversation: 'ابدأ محادثة في هذا المشروع',
    conversationsEmpty: 'لا محادثات بعد',
    conversationsEmptyDesc: 'ابدأ محادثة جديدة وسيعتمد NEXUS على هذا المشروع كسياق.',
    backToProjects: 'المشاريع',
    name: 'الاسم',
    namePlaceholder: 'مثال: تسويق الربع الأول',
    description: 'الوصف (اختياري)',
    descriptionPlaceholder: 'عن ماذا هذا المشروع؟',
    color: 'اللون',
    customInstructions: 'تعليمات مخصصة',
    customInstructionsPlaceholder:
      'توجيهات دائمة لهذا المشروع. مثال: "استخدم TypeScript. الجمهور المستهدف هو فريق المهندسين الكبار. أجب بإيجاز."',
    customInstructionsHint:
      'تُحقن هذه التعليمات في تعليمات نظام NEXUS لكل محادثة في هذا المشروع.',
    save: 'حفظ',
    cancel: 'إلغاء',
    create: 'إنشاء',
    edit: 'تعديل',
    delete: 'حذف',
    confirmDelete: 'حذف هذا المشروع؟',
    confirmDeleteDesc:
      'سيُحذف المشروع وملفاته وتعليماته المخصصة. المحادثات المرتبطة تحتفظ بسجلها لكنها تفقد سياق المشروع.',
    addFile: 'إضافة ملف',
    filename: 'اسم الملف',
    filenamePlaceholder: 'مثال: app-config.ts',
    fileContent: 'محتوى الملف',
    fileContentPlaceholder: 'الصق محتوى الملف هنا (نص فقط، الحد الأقصى 200 كيلوبايت)...',
    uploadFromDevice: 'رفع من الجهاز',
    noFiles: 'لا ملفات بعد',
    noFilesDesc: 'أضف أكواد أو إعدادات أو ملاحظات — وسيستخدمها NEXUS كخلفية للمحادثات في هذا المشروع.',
    saveInstructions: 'حفظ التعليمات',
    instructionsSaved: 'تم الحفظ.',
    fileAdded: 'تمت إضافة الملف.',
    fileDeleted: 'تم حذف الملف.',
    projectCreated: 'تم إنشاء المشروع.',
    projectUpdated: 'تم تحديث المشروع.',
    projectDeleted: 'تم حذف المشروع.',
    loading: 'جارٍ التحميل...',
    error: 'حدث خطأ ما',
    retry: 'إعادة المحاولة',
    signInTitle: 'المشاريع',
    signInCta: 'سجّل الدخول لاستخدام المشاريع',
    signInDesc:
      'المشاريع مرتبطة بحسابك. سجّل الدخول لتنظيم المحادثات والملفات والتعليمات الدائمة لأعمالك الجارية.',
    signIn: 'تسجيل الدخول',
    signUp: 'إنشاء حساب',
    lastActivity: 'آخر نشاط',
    bytes: 'بايت',
    kilobytes: 'ك.ب',
    megabytes: 'م.ب',
    newConversation: 'محادثة جديدة',
    existingConversation: 'المحادثات في هذا المشروع',
    settings: 'الإعدادات',
    statsConv: 'محادثات',
    statsFiles: 'ملفات',
  },
} as const

type Lang = keyof typeof T

// ----- color gradient keys (matches ALLOWED_COLORS in the API) -----
const COLOR_GRADIENTS: Record<string, string> = {
  amber: 'from-amber-500 to-orange-500',
  orange: 'from-orange-500 to-rose-500',
  rose: 'from-rose-500 to-pink-500',
  pink: 'from-pink-500 to-rose-500',
  yellow: 'from-yellow-500 to-amber-500',
}
const COLOR_KEYS = Object.keys(COLOR_GRADIENTS)

// ----- types -----
interface ProjectListItem {
  id: string
  name: string
  description: string
  color: string
  customInstructions: string
  stats: { conversations: number; files: number }
  createdAt: string
  updatedAt: string
}

interface ProjectSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface ProjectFileMeta {
  id: string
  filename: string
  mimeType: string
  size: number
  createdAt: string
  updatedAt: string
}

interface ProjectDetail {
  id: string
  name: string
  description: string
  color: string
  customInstructions: string
  createdAt: string
  updatedAt: string
  sessions: ProjectSession[]
  files: ProjectFileMeta[]
}

// ----- helpers -----
function timeAgo(iso: string, lang: Lang): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (!Number.isFinite(diff) || diff < 0) return lang === 'ar' ? 'الآن' : 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return lang === 'ar' ? 'الآن' : 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return lang === 'ar' ? `قبل ${min} د` : `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return lang === 'ar' ? `قبل ${hr} س` : `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return lang === 'ar' ? `قبل ${day} ي` : `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return lang === 'ar' ? `قبل ${wk} أ` : `${wk}w ago`
  const mon = Math.floor(day / 30)
  return lang === 'ar' ? `قبل ${mon} ش` : `${mon}mo ago`
}

function formatBytes(n: number, lang: Lang): string {
  const tr = T[lang]
  if (n < 1024) return `${n} ${tr.bytes}`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ${tr.kilobytes}`
  return `${(n / (1024 * 1024)).toFixed(1)} ${tr.megabytes}`
}

// ----- main component -----
export interface ProjectsModeProps {
  language?: Lang
  /** Whether this tab is currently active (keep-alive pattern — the tab
   *  stays mounted when hidden; data refetches when it becomes active
   *  again). */
  active?: boolean
  /** Called when the user clicks "Start conversation in this project". The
   *  parent (page.tsx) wires this to: setActiveProjectId(projectId),
   *  setCurrentChatSessionId(null), setMessages([]), toolEngine.clear(),
   *  setActiveTab('chat') — so the next chat message creates a new session
   *  bound to this project. */
  onStartProjectChat?: (projectId: string, projectName: string) => void
  /** Called when the user wants to sign in (the guest CTA). */
  onSignIn?: () => void
  /** Whether the user is signed in. The parent should pass this from its
   *  auth state so we can render the guest CTA without a network round-trip. */
  isAuthenticated?: boolean
}

export function ProjectsMode({
  language = 'en',
  onStartProjectChat,
  onSignIn,
  isAuthenticated = true,
  active = true,
}: ProjectsModeProps) {
  const tr = T[language]
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<ProjectListItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' })
      if (res.status === 401) {
        // Guest — render empty list; the CTA is shown via isAuthenticated=false.
        setProjects([])
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setProjects(Array.isArray(data.projects) ? data.projects : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : tr.error)
    } finally {
      setLoading(false)
    }
  }, [tr.error])

  useEffect(() => {
    if (isAuthenticated) fetchProjects()
    else setLoading(false)
  }, [fetchProjects, isAuthenticated])

  // Keep-alive refresh: refetch when the tab becomes active again after
  // being away (projects may have changed via chat sessions bound to them).
  const prevActive = useRef(active)
  useEffect(() => {
    if (active && prevActive.current === false && isAuthenticated) {
      fetchProjects()
    }
    prevActive.current = active
  }, [active, fetchProjects, isAuthenticated])

  // Guest CTA — projects are user-scoped, no anonymous path.
  if (!isAuthenticated) {
    return (
      <div className="omni-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-md px-4 py-12">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-md">
              <FolderKanban className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold">{tr.signInTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{tr.signInCta}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">{tr.signInDesc}</p>
            {onSignIn && (
              <button
                onClick={onSignIn}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
              >
                <Sparkles className="h-4 w-4" />
                {tr.signIn}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Detail view (project is open)
  if (activeProjectId) {
    return (
      <ProjectDetailView
        id={activeProjectId}
        language={language}
        onBack={() => {
          setActiveProjectId(null)
          fetchProjects()
        }}
        onStartProjectChat={onStartProjectChat}
      />
    )
  }

  // Loading skeleton
  if (loading && projects.length === 0) {
    return (
      <div className="omni-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-8 w-40 animate-pulse rounded-lg bg-secondary" />
            <div className="h-9 w-24 animate-pulse rounded-full bg-secondary" />
          </div>
          <div className="mb-5 h-11 animate-pulse rounded-xl bg-secondary" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="omni-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-md px-4 py-12">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <p className="text-sm font-medium text-destructive">{tr.error}</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <button
              onClick={fetchProjects}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium transition hover:bg-secondary/70"
            >
              <RefreshCw className="h-3 w-3" /> {tr.retry}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="omni-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{tr.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{tr.subtitle}</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> {tr.newProject}
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <FolderKanban className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-medium">{tr.noProjects}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tr.noProjectsDesc}</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> {tr.newProjectCta}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const gradient = COLOR_GRADIENTS[p.color] ?? COLOR_GRADIENTS.amber
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 transition hover:border-primary/30 hover:bg-secondary/40"
                >
                  {/* Click target — opens the project detail */}
                  <button
                    onClick={() => setActiveProjectId(p.id)}
                    className="absolute inset-0 z-0 cursor-pointer"
                    aria-label={p.name}
                    tabIndex={-1}
                  />
                  {/* Header */}
                  <div className="relative z-10 flex items-start justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}>
                      <FolderKanban className="h-5 w-5" />
                    </span>
                    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing(p) }}
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        aria-label={tr.edit}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(p.id) }}
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                        aria-label={tr.delete}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Body */}
                  <button
                    onClick={() => setActiveProjectId(p.id)}
                    className="relative z-10 text-left"
                  >
                    <h3 className="text-sm font-semibold">{p.name}</h3>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                  </button>
                  {/* Footer */}
                  <div className="relative z-10 flex items-center justify-between border-t border-border/60 pt-2.5">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p.stats.conversations}</span>
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{p.stats.files}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(p.updatedAt, language)}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Create modal */}
        <AnimatePresence>
          {showCreate && (
            <ProjectFormModal
              mode="create"
              language={language}
              onClose={() => setShowCreate(false)}
              onSaved={(project) => {
                setShowCreate(false)
                fetchProjects()
                // Optionally navigate into the new project immediately.
                setActiveProjectId(project.id)
              }}
            />
          )}
        </AnimatePresence>

        {/* Edit modal */}
        <AnimatePresence>
          {editing && (
            <ProjectFormModal
              mode="edit"
              language={language}
              initial={editing}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                fetchProjects()
              }}
            />
          )}
        </AnimatePresence>

        {/* Delete confirm */}
        <AnimatePresence>
          {deletingId && (
            <DeleteConfirmModal
              language={language}
              projectName={projects.find((p) => p.id === deletingId)?.name ?? ''}
              onClose={() => setDeletingId(null)}
              onConfirm={async () => {
                const id = deletingId
                setDeletingId(null)
                try {
                  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
                  if (!res.ok) throw new Error(`HTTP ${res.status}`)
                  fetchProjects()
                } catch (e) {
                  setError(e instanceof Error ? e.message : tr.error)
                }
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ----- detail view -----
function ProjectDetailView({
  id,
  language,
  onBack,
  onStartProjectChat,
}: {
  id: string
  language: Lang
  onBack: () => void
  onStartProjectChat?: (projectId: string, projectName: string) => void
}) {
  const tr = T[language]
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'conversations' | 'files' | 'instructions'>('conversations')

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setProject(data.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : tr.error)
    } finally {
      setLoading(false)
    }
  }, [id, tr.error])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  if (loading && !project) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="h-4 w-40 animate-pulse rounded bg-secondary" />
        </div>
        <div className="flex-1 px-4 py-4">
          <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border/60 px-4 py-3">
          <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {tr.backToProjects}
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
          <p className="text-sm font-medium text-destructive">{tr.error}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <button onClick={onBack} className="mt-4 rounded-lg bg-secondary px-3 py-2 text-xs font-medium transition hover:bg-secondary/70">
            {tr.backToProjects}
          </button>
        </div>
      </div>
    )
  }

  const gradient = COLOR_GRADIENTS[project.color] ?? COLOR_GRADIENTS.amber

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {tr.backToProjects}
        </button>
        <div className="ml-2 flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-white`}>
            <FolderKanban className="h-3.5 w-3.5" />
          </span>
          <h1 className="text-base font-semibold">{project.name}</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60 px-4 py-2">
        {([
          { id: 'conversations' as const, label: tr.conversations, count: project.sessions.length },
          { id: 'files' as const, label: tr.files, count: project.files.length },
          { id: 'instructions' as const, label: tr.instructions },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              tab === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            {t.label}
            {'count' in t && typeof t.count === 'number' && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tab === t.id ? 'bg-background/60' : 'bg-secondary/80'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="omni-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4">
          {tab === 'conversations' && (
            <ConversationsTab
              project={project}
              language={language}
              onStartProjectChat={onStartProjectChat}
            />
          )}
          {tab === 'files' && (
            <FilesTab project={project} language={language} onFilesChanged={fetchDetail} />
          )}
          {tab === 'instructions' && (
            <InstructionsTab project={project} language={language} onSaved={fetchDetail} />
          )}
        </div>
      </div>
    </div>
  )
}

// ----- conversations tab -----
function ConversationsTab({
  project,
  language,
  onStartProjectChat,
}: {
  project: ProjectDetail
  language: Lang
  onStartProjectChat?: (projectId: string, projectName: string) => void
}) {
  const tr = T[language]
  return (
    <div className="space-y-4">
      {/* Start new conversation */}
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Plus className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{tr.newConversation}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tr.conversationsEmptyDesc}</p>
          </div>
        </div>
        <button
          onClick={() => onStartProjectChat?.(project.id, project.name)}
          disabled={!onStartProjectChat}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {tr.startConversation}
        </button>
      </div>

      {/* Existing conversations */}
      {project.sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium">{tr.conversationsEmpty}</p>
        </div>
      ) : (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tr.existingConversation}
          </h3>
          <div className="space-y-1.5">
            {project.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title || tr.newConversation}</p>
                  <p className="truncate text-xs text-muted-foreground">{tr.lastActivity}: {timeAgo(s.updatedAt, language)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ----- files tab -----
function FilesTab({
  project,
  language,
  onFilesChanged,
}: {
  project: ProjectDetail
  language: Lang
  onFilesChanged: () => void
}) {
  const tr = T[language]
  const [showAdd, setShowAdd] = useState(false)
  const [filename, setFilename] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!filename.trim() || !content.trim() || saving) return
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: filename.trim().slice(0, 200),
          content: content.slice(0, 200 * 1024),
          mimeType: guessMime(filename),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      setFilename('')
      setContent('')
      setShowAdd(false)
      onFilesChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr.error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(fileId: string) {
    setBusyId(fileId)
    try {
      const res = await fetch(`/api/projects/${project.id}/files/${fileId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onFilesChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr.error)
    } finally {
      setBusyId(null)
    }
  }

  function handleUploadFromDevice(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFilename(f.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      // Cap at 200KB to match the API limit; user can trim manually.
      setContent(text.slice(0, 200 * 1024))
    }
    reader.onerror = () => setErr('Could not read file.')
    reader.readAsText(f)
    setShowAdd(true)
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {tr.files} · {project.files.length}
        </h3>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="text/*,.ts,.tsx,.js,.jsx,.json,.md,.css,.html,.yml,.yaml,.csv,.txt"
            onChange={handleUploadFromDevice}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition hover:bg-secondary"
          >
            <Upload className="h-3.5 w-3.5" /> {tr.uploadFromDevice}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" /> {tr.addFile}
          </button>
        </div>
      </div>

      {err && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Add-file form */}
      <AnimatePresence>
        {showAdd && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAdd}
            className="overflow-hidden rounded-2xl border border-border bg-card p-4"
          >
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{tr.filename}</label>
                <input
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder={tr.filenamePlaceholder}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{tr.fileContent}</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder={tr.fileContentPlaceholder}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {content.length.toLocaleString()} / 200,000 chars
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setErr(null) }}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary"
                >
                  {tr.cancel}
                </button>
                <button
                  type="submit"
                  disabled={!filename.trim() || !content.trim() || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {tr.save}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Files list */}
      {project.files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium">{tr.noFiles}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tr.noFilesDesc}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {project.files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.filename}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatBytes(f.size, language)} · {f.mimeType} · {timeAgo(f.createdAt, language)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(f.id)}
                disabled={busyId === f.id}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                aria-label={tr.delete}
              >
                {busyId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ----- instructions tab -----
function InstructionsTab({
  project,
  language,
  onSaved,
}: {
  project: ProjectDetail
  language: Lang
  onSaved: () => void
}) {
  const tr = T[language]
  const [text, setText] = useState(project.customInstructions)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Re-sync when the project changes (e.g. after parent refetch).
  useEffect(() => {
    setText(project.customInstructions)
  }, [project.customInstructions])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customInstructions: text.slice(0, 4000) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      setSavedAt(Date.now())
      // Auto-clear the "Saved." hint after 3s.
      setTimeout(() => setSavedAt(null), 3000)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr.error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="block text-sm font-semibold">{tr.customInstructions}</label>
        <p className="mt-1 text-xs text-muted-foreground">{tr.customInstructionsHint}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={tr.customInstructionsPlaceholder}
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {text.length.toLocaleString()} / 4,000
          </span>
          {savedAt && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-500">
              <Sparkles className="h-3 w-3" /> {tr.instructionsSaved}
            </span>
          )}
        </div>
        {err && (
          <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || text === project.customInstructions}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {tr.saveInstructions}
          </button>
        </div>
      </div>
    </div>
  )
}

// ----- create / edit modal (shared form) -----
function ProjectFormModal({
  mode,
  language,
  initial,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  language: Lang
  initial?: ProjectListItem
  onClose: () => void
  onSaved: (project: { id: string; name: string }) => void
}) {
  const tr = T[language]
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? 'amber')
  const [customInstructions, setCustomInstructions] = useState(initial?.customInstructions ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setErr(null)
    try {
      const body = {
        name: name.trim().slice(0, 100),
        description: description.slice(0, 500),
        color,
        customInstructions: customInstructions.slice(0, 4000),
      }
      const url = mode === 'create' ? '/api/projects' : `/api/projects/${initial!.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      onSaved(data.project)
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr.error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <motion.form
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onSubmit={handleSubmit}
        className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {mode === 'create' ? tr.newProjectCta : tr.edit}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground transition hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{tr.name}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr.namePlaceholder}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{tr.description}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={tr.descriptionPlaceholder}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{tr.color}</label>
            <div className="flex items-center gap-2">
              {COLOR_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setColor(k)}
                  className={`h-7 w-7 rounded-full bg-gradient-to-br ${COLOR_GRADIENTS[k]} transition ${
                    color === k ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''
                  }`}
                  aria-label={k}
                />
              ))}
            </div>
          </div>
          {mode === 'create' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{tr.customInstructions}</label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={3}
                placeholder={tr.customInstructionsPlaceholder}
                className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
            </div>
          )}
        </div>

        {err && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary">
            {tr.cancel}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {mode === 'create' ? tr.create : tr.save}
          </button>
        </div>
      </motion.form>
    </>
  )
}

// ----- delete confirm modal -----
function DeleteConfirmModal({
  language,
  projectName,
  onClose,
  onConfirm,
}: {
  language: Lang
  projectName: string
  onClose: () => void
  onConfirm: () => void
}) {
  const tr = T[language]
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={busy ? undefined : onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">{tr.confirmDelete}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{projectName}</span> — {tr.confirmDeleteDesc}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-40">
            {tr.cancel}
          </button>
          <button
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false) }}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {tr.delete}
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ----- helpers -----
function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    ts: 'text/typescript',
    tsx: 'text/typescript',
    js: 'text/javascript',
    jsx: 'text/javascript',
    mjs: 'text/javascript',
    json: 'application/json',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    css: 'text/css',
    html: 'text/html',
    yml: 'text/yaml',
    yaml: 'text/yaml',
    csv: 'text/csv',
    py: 'text/x-python',
    rs: 'text/x-rust',
    go: 'text/x-go',
    java: 'text/x-java',
    kt: 'text/x-kotlin',
    swift: 'text/x-swift',
    rb: 'text/x-ruby',
    php: 'text/x-php',
    sh: 'text/x-shellscript',
    sql: 'text/x-sql',
    toml: 'text/x-toml',
    xml: 'application/xml',
  }
  return map[ext] ?? 'text/plain'
}
