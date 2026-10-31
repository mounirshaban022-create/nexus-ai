'use client'

import { useEffect, useState, useCallback } from 'react'
import { Mail, MessageCircle, Send, CheckCircle2, XCircle, Phone, ShieldCheck } from 'lucide-react'
import { api, timeAgo, type EmailAccountRow, type WhatsAppAccountRow, type WhatsAppMessageRow } from '../console-types'

interface MessagingData {
  email: { accounts: EmailAccountRow[]; configured: boolean }
  whatsapp: {
    accounts: (WhatsAppAccountRow & { verifyToken: string })[]
    messages: WhatsAppMessageRow[]
    threads: { contact: string; count: number; last: WhatsAppMessageRow }[]
  }
}

export function MessagingView({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<MessagingData | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [emailForm, setEmailForm] = useState({ accountId: '', to: '', subject: '', text: '' })
  const [waForm, setWaForm] = useState({ accountId: '', to: '', text: '' })

  const load = useCallback(async () => {
    try {
      const r = await api<MessagingData>('/messaging')
      setData(r)
      setEmailForm(f => ({ ...f, accountId: f.accountId || (r.email.accounts[0]?.id ?? '') }))
      setWaForm(w => ({ ...w, accountId: w.accountId || (r.whatsapp.accounts[0]?.id ?? '') }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const sendEmail = async () => {
    setSending(true); setError(''); setNotice('')
    try {
      const r = await api<{ ok: boolean; messageId?: string }>('/messaging', {
        method: 'POST',
        body: JSON.stringify({ channel: 'email', ...emailForm }),
      })
      setNotice(`Email sent ✓ ${r.messageId ?? ''}`)
      setEmailForm(f => ({ ...f, subject: '', text: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  const sendWhatsapp = async () => {
    setSending(true); setError(''); setNotice('')
    try {
      await api('/messaging', { method: 'POST', body: JSON.stringify({ channel: 'whatsapp', ...waForm }) })
      setNotice('WhatsApp message sent ✓')
      setWaForm(w => ({ ...w, text: '' }))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  if (!data) return <p className="text-sm text-slate-500">{error || 'Loading messaging…'}</p>

  return (
    <div className="space-y-5">
      {(notice || error) && <p className={`text-xs ${error ? 'text-rose-400' : 'text-emerald-400'}`}>{error || notice}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* EMAIL */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">Email accounts</h3>
            <span className={`ml-auto text-[11px] ${data.email.configured ? 'text-emerald-400' : 'text-amber-400'}`}>
              {data.email.configured ? 'encryption secret present' : 'NEXUS_EMAIL_SECRET missing'}
            </span>
          </div>
          {data.email.accounts.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-800 p-4 text-xs text-slate-500">
              No email accounts connected yet. Users connect their own private SMTP/IMAP accounts in the app; they appear here with live status.
            </p>
          )}
          <div className="space-y-2">
            {data.email.accounts.map(a => (
              <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-200">{a.label || a.email}</p>
                  {a.status === 'connected' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />}
                  <span className="ml-auto text-[10px] text-slate-500">{a.user?.email ?? 'legacy'}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {a.email} · SMTP {a.smtpHost}:{a.smtpPort} · {a.status}{a.statusMessage ? ` — ${a.statusMessage}` : ''}
                </p>
              </div>
            ))}
          </div>

          {data.email.accounts.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Send test email</p>
              <div className="space-y-2">
                <select
                  value={emailForm.accountId}
                  onChange={e => setEmailForm(f => ({ ...f, accountId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs"
                >
                  {data.email.accounts.map(a => <option key={a.id} value={a.id}>{a.label || a.email} ({a.email})</option>)}
                </select>
                <input value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} placeholder="Recipient email"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs" />
                <input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs" />
                <textarea value={emailForm.text} onChange={e => setEmailForm(f => ({ ...f, text: e.target.value }))} placeholder="Message" rows={3}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs" />
                <button onClick={sendEmail} disabled={sending || !emailForm.to}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send real email'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* WHATSAPP */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">WhatsApp Business (Meta Cloud API)</h3>
          </div>
          {data.whatsapp.accounts.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-800 p-4 text-xs text-slate-500">
              No WhatsApp connections yet. Users connect a Meta Cloud API number in the app; credentials arrive AES-256-GCM encrypted and appear here with webhook status.
            </p>
          )}
          <div className="space-y-2">
            {data.whatsapp.accounts.map(a => (
              <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-sm font-medium text-slate-200">{a.businessName || a.label}</p>
                  {a.webhookVerified ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-amber-400" />}
                  <span className="ml-auto text-[10px] text-slate-500">{a.user?.email ?? 'legacy'}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  +{a.displayPhone || 'no number'} · {a.status} · webhook {a.webhookVerified ? 'verified' : 'pending'} · auto-reply {a.autoReply ? 'on' : 'off'}
                </p>
              </div>
            ))}
          </div>

          {data.whatsapp.threads.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Recent conversations</p>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {data.whatsapp.threads.map(t => (
                  <div key={t.contact} className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
                    <p className="font-medium text-slate-300">+{t.contact} <span className="ml-1 text-[10px] text-slate-500">{t.count} msgs · {timeAgo(t.last.createdAt)}</span></p>
                    <p className="line-clamp-1 text-[11px] text-slate-500">{t.last.direction === 'in' ? '←' : '→'} {t.last.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.whatsapp.accounts.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Send WhatsApp message</p>
              <div className="space-y-2">
                <select
                  value={waForm.accountId}
                  onChange={e => setWaForm(w => ({ ...w, accountId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs"
                >
                  {data.whatsapp.accounts.map(a => <option key={a.id} value={a.id}>{a.businessName || a.label} (+{a.displayPhone})</option>)}
                </select>
                <input value={waForm.to} onChange={e => setWaForm(w => ({ ...w, to: e.target.value }))} placeholder="Recipient number (E.164, e.g. 15551234567)"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs" />
                <textarea value={waForm.text} onChange={e => setWaForm(w => ({ ...w, text: e.target.value }))} placeholder="Message" rows={2}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs" />
                <button onClick={sendWhatsapp} disabled={sending || !waForm.to || !waForm.text}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send via Meta Cloud API'}
                </button>
                <p className="text-[10px] text-slate-600">Meta test numbers restrict recipients to the account allow-list.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
