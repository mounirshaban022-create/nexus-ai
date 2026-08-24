'use client'

/**
 * Phase 1 — Priority 1: Memory section for the profile page.
 *
 * Lets a signed-in user view / add / edit / delete their durable memories
 * (the ones injected into the system prompt for new chat sessions, and
 * the ones captured from "remember: ..." directives in chat).
 *
 * All operations go through /api/memory (REST) which enforces session-cookie
 * auth (Phase 0 Bug 2) and ownership (Phase 0 Bug 3). A guest sees a
 * sign-in CTA instead of the list.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Brain,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

interface MemoryRow {
  id: string
  content: string
  sourceSessionId: string | null
  createdAt: string
  updatedAt: string
}

interface MemorySectionProps {
  /** Drive RTL from the parent's language setting. */
  language: 'en' | 'ar'
}

const MAX_CHARS = 600

const T = {
  en: {
    title: 'Memory',
    subtitle: 'What NEXUS remembers about you across conversations.',
    add: 'Add memory',
    placeholder: 'e.g. I\'m a morning person, prefers concise answers, lives in Dubai…',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Delete this memory? NEXUS will forget it.',
    empty: 'No memories yet. Add one above, or type "remember: …" in chat.',
    errorLoad: 'Could not load memories.',
    errorSave: 'Could not save. Try again.',
    errorDelete: 'Could not delete. Try again.',
    signInTitle: 'Sign in to use memory',
    signInBody: 'Memory is per-user. Sign in to let NEXUS remember facts about you across conversations.',
    signIn: 'Sign in',
    chars: (n: number) => `${n} / ${MAX_CHARS}`,
    capturedFromChat: 'from chat',
    addedManually: 'manual',
  },
  ar: {
    title: 'الذاكرة',
    subtitle: 'ما يتذكّره NEXUS عنك عبر المحادثات.',
    add: 'إضافة ذاكرة',
    placeholder: 'مثال: أنا شخص صباحي، أفضل الإجابات الموجزة، أعيش في دبي…',
    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    delete: 'حذف',
    confirmDelete: 'حذف هذه الذاكرة؟ سينساها NEXUS.',
    empty: 'لا ذاكرة بعد. أضف واحدة أعلاه، أو اكتب "تذكّر: …" في المحادثة.',
    errorLoad: 'تعذّر تحميل الذكريات.',
    errorSave: 'تعذّر الحفظ. حاول مجددًا.',
    errorDelete: 'تعذّر الحذف. حاول مجددًا.',
    signInTitle: 'سجّل الدخول لاستخدام الذاكرة',
    signInBody: 'الذاكرة مرتبطة بالمستخدم. سجّل الدخول ليتذكّر NEXUS معلومات عنك عبر المحادثات.',
    signIn: 'تسجيل الدخول',
    chars: (n: number) => `${n} / ${MAX_CHARS}`,
    capturedFromChat: 'من المحادثة',
    addedManually: 'يدوي',
  },
} as const

export function MemorySection({ language }: MemorySectionProps) {
  const auth = useAuth()
  const user = auth.user
  const t = T[language]
  const isRtl = language === 'ar'

  const [memories, setMemories] = useState<MemoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newText, setNewText] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/memory')
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { memories: MemoryRow[] }
      setMemories(data.memories)
    } catch {
      setError(t.errorLoad)
    } finally {
      setLoading(false)
    }
  }, [user, t.errorLoad])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async () => {
    const content = newText.trim()
    if (!content) return
    setSavingNew(true)
    setError(null)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'save failed')
      }
      const data = (await res.json()) as { memory: MemoryRow }
      setMemories((prev) => [data.memory, ...prev])
      setNewText('')
    } catch {
      setError(t.errorSave)
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (m: MemoryRow) => {
    setEditingId(m.id)
    setEditText(m.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const content = editText.trim()
    if (!content) return
    setSavingEditId(editingId)
    setError(null)
    try {
      const res = await fetch(`/api/memory/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'save failed')
      }
      const data = (await res.json()) as { memory: MemoryRow }
      setMemories((prev) => prev.map((m) => (m.id === data.memory.id ? data.memory : m)))
      setEditingId(null)
      setEditText('')
    } catch {
      setError(t.errorSave)
    } finally {
      setSavingEditId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t.confirmDelete)) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch {
      setError(t.errorDelete)
    } finally {
      setDeletingId(null)
    }
  }

  // Guests see a sign-in CTA (memory is per-user only — no guest path).
  if (!user) {
    return (
      <section className="mt-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Brain className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">{t.title}</span>
          </div>
          <div className="p-4 text-center">
            <p className="text-sm font-medium text-foreground">{t.signInTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.signInBody}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {/* Header row — collapsible */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="profile-memory-content"
          className="flex w-full items-center justify-between p-4 text-left transition hover:bg-secondary/60"
        >
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">{t.title}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {memories.length}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </button>

        {open && (
          <div id="profile-memory-content" className="border-t border-border">
            <div className="p-4">
              <p className="mb-3 text-xs text-muted-foreground">{t.subtitle}</p>

              {/* New-memory composer */}
              <div className="flex flex-col gap-2">
                <textarea
                  dir={isRtl ? 'rtl' : 'ltr'}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value.slice(0, MAX_CHARS))}
                  placeholder={t.placeholder}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {t.chars(newText.length)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNewText('')}
                      disabled={!newText || savingNew}
                      className="h-8"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t.cancel}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAdd}
                      disabled={!newText.trim() || savingNew}
                      className="h-8"
                    >
                      {savingNew ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {t.save}
                    </Button>
                  </div>
                </div>
              </div>

              {error && (
                <p className="mt-3 text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}

              {/* Memory list */}
              <ul className="mt-4 flex flex-col gap-2" dir={isRtl ? 'rtl' : 'ltr'}>
                {loading ? (
                  <li className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </li>
                ) : memories.length === 0 ? (
                  <li className="py-6 text-center text-xs text-muted-foreground">{t.empty}</li>
                ) : (
                  memories.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      {editingId === m.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            dir={isRtl ? 'rtl' : 'ltr'}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value.slice(0, MAX_CHARS))}
                            rows={2}
                            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">
                              {t.chars(editText.length)}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEdit}
                                disabled={savingEditId === m.id}
                                className="h-7"
                              >
                                {t.cancel}
                              </Button>
                              <Button
                                size="sm"
                                onClick={saveEdit}
                                disabled={!editText.trim() || savingEditId === m.id}
                                className="h-7"
                              >
                                {savingEditId === m.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Save className="h-3.5 w-3.5" />
                                )}
                                {t.save}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm text-foreground">{m.content}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {m.sourceSessionId ? t.capturedFromChat : t.addedManually}
                              {' · '}
                              {new Date(m.createdAt).toLocaleDateString(
                                isRtl ? 'ar' : 'en-US',
                                { month: 'short', day: 'numeric', year: 'numeric' }
                              )}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => startEdit(m)}
                              disabled={deletingId === m.id}
                              className="h-7 w-7"
                              aria-label={t.edit}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(m.id)}
                              disabled={!!deletingId}
                              className="h-7 w-7"
                              aria-label={t.delete}
                            >
                              {deletingId === m.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default MemorySection
