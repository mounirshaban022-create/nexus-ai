'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowSquareOut,
  CheckCircle,
  ChatCircleDots,
  Clipboard,
  Copy,
  Gear,
  PaperPlaneTilt,
  Plug,
  ShieldCheck,
  SpinnerGap,
  Warning,
  WhatsappLogo,
  X,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'

/* ------------------------------------------------------------------ */
/* WhatsApp Business mode — Meta Cloud API integration.                */
/*                                                                     */
/* Phase 1 (test-number flow) needs NO business verification:          */
/*   1. Meta developer app + WhatsApp product  → free test number      */
/*   2. Paste Phone Number ID + Access Token    → NEXUS can SEND       */
/*   3. Configure the webhook (on the deployed URL) → NEXUS can REPLY  */
/*                                                                     */
/* The owner's own number is pre-filled as the first test recipient.   */
/* ------------------------------------------------------------------ */

/* Owner's WhatsApp number, used only for the test-recipient prefill and the
 * wizard helper copy. Kept out of the shipped JS bundle unless explicitly
 * provided at build time via NEXT_PUBLIC_OWNER_NUMBER — never hard-code
 * personal data here. */
const OWNER_NUMBER = process.env.NEXT_PUBLIC_OWNER_NUMBER ?? ''

interface WaAccount {
  id: string
  businessName: string
  phoneNumberId: string
  displayPhone: string
  verifyToken: string
  status: string
  statusMessage: string
  autoReply: boolean
  agentPrompt: string
  allowList: string[]
  webhookVerified: boolean
  tokenPreview: string
}

interface WaMessage {
  id: string
  from: string
  to: string
  direction: 'in' | 'out'
  body: string
  status: string
  createdAt: string
}

interface Conversation {
  peer: string
  lastAt: string
  lastBody: string
  lastDirection: string
  count: number
}

function fmtPhone(digits: string): string {
  if (digits.startsWith('971') && digits.length >= 11) {
    return `+971 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  return `+${digits}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function WhatsAppMode() {
  const { toast } = useToast()

  /* ------------------------------ state ------------------------------ */
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<WaAccount | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')

  // Setup form
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [businessName, setBusinessName] = useState('NEXUS Assistant')
  const [saving, setSaving] = useState(false)

  // Test message
  const [testTo, setTestTo] = useState(OWNER_NUMBER)
  const [testMsg, setTestMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [testSent, setTestSent] = useState(false)

  // Inbox
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activePeer, setActivePeer] = useState<string | null>(null)

  // Settings
  const [autoReply, setAutoReply] = useState(true)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [promptDirty, setPromptDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  /* ------------------------------ data ------------------------------ */

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/account')
      if (res.ok) {
        const data = await res.json()
        setAccount(data.account)
        setWebhookUrl(data.webhookUrl ?? '')
        if (data.account) {
          setAutoReply(data.account.autoReply)
          if (!promptDirty) setAgentPrompt(data.account.agentPrompt ?? '')
          setTestTo((prev) => (prev ? prev : OWNER_NUMBER))
        }
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [promptDirty])

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/messages')
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages ?? [])
        setConversations(data.conversations ?? [])
        setActivePeer((prev) => prev ?? data.conversations?.[0]?.peer ?? null)
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    loadAccount()
  }, [loadAccount])

  useEffect(() => {
    if (!account) return
    loadMessages()
    const timer = setInterval(loadMessages, 8_000)
    return () => clearInterval(timer)
  }, [account, loadMessages])

  /* ------------------------------ actions ------------------------------ */

  const saveCredentials = useCallback(async () => {
    if (!/^\d{5,25}$/.test(phoneNumberId.trim())) {
      toast({
        title: 'Invalid Phone Number ID',
        description: 'It’s the long number from the API Setup tab — digits only.',
        variant: 'destructive',
      })
      return
    }
    if (accessToken.trim().length < 20) {
      toast({
        title: 'Invalid Access Token',
        description: 'Paste the full token from the Meta console (it’s long).',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: phoneNumberId.trim(),
          accessToken: accessToken.trim(),
          businessName: businessName.trim() || 'NEXUS Assistant',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Meta rejected these credentials.')
      setAccount(data.account)
      setAccessToken('')
      toast({
        title: 'WhatsApp connected ✓',
        description: 'Credentials verified with Meta. Now send yourself a test message.',
      })
    } catch (error) {
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [phoneNumberId, accessToken, businessName, toast])

  const sendTest = useCallback(async () => {
    const to = testTo.replace(/[^\d]/g, '')
    if (to.length < 8) {
      toast({ title: 'Enter a valid phone number', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: testMsg.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setTestSent(true)
      loadMessages()
      toast({ title: 'Message sent ✓', description: `Delivered to ${fmtPhone(to)} — check WhatsApp.` })
    } catch (error) {
      toast({
        title: 'Test message failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }, [testTo, testMsg, toast, loadMessages])

  const saveSettings = useCallback(
    async (patch?: { autoReply?: boolean; agentPrompt?: string }) => {
      setSavingSettings(true)
      try {
        const res = await fetch('/api/whatsapp/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            autoReply: patch?.autoReply ?? autoReply,
            agentPrompt: patch?.agentPrompt ?? agentPrompt,
            businessName: account?.businessName,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Save failed')
        setAccount(data.account)
        setPromptDirty(false)
        toast({ title: 'Settings saved ✓' })
      } catch (error) {
        toast({
          title: 'Could not save',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setSavingSettings(false)
      }
    },
    [autoReply, agentPrompt, account, toast]
  )

  const copy = useCallback(
    (text: string, label: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => toast({ title: `${label} copied ✓` }))
        .catch(() => toast({ title: 'Copy failed — select manually', variant: 'destructive' }))
    },
    [toast]
  )

  const disconnect = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/account', { method: 'DELETE' })
      // Only clear local state when the server actually disconnected the
      // account — otherwise the UI would show the setup wizard while the
      // account (and its webhook) is still live on the server.
      if (!res.ok) {
        toast({
          title: 'Could not disconnect',
          description: 'The server rejected the request — your WhatsApp account is still connected. Please try again.',
          variant: 'destructive',
        })
        return
      }
      setAccount(null)
      setMessages([])
      setConversations([])
      toast({ title: 'WhatsApp disconnected' })
    } catch {
      toast({ title: 'Could not disconnect', variant: 'destructive' })
    }
  }, [toast])

  /* ------------------------------ derived ------------------------------ */

  const activeMessages = useMemo(
    () => (activePeer ? messages.filter((m) => m.from === activePeer || m.to === activePeer) : []),
    [messages, activePeer]
  )

  const lastOutWasSent = messages.some((m) => m.direction === 'out')

  /* ------------------------------ render ------------------------------ */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <SpinnerGap className="h-8 w-8 animate-spin text-emerald-400" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        {/* ---------- Header ---------- */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <WhatsappLogo
                className="h-6 w-6 text-emerald-400"
                weight="fill"
                aria-hidden
              />
              WhatsApp Business
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {account
                ? `NEXUS answers your customers on WhatsApp — ${account.businessName}`
                : 'Let NEXUS reply to your customers on WhatsApp — no business verification needed to start.'}
            </p>
          </div>
          {account && (
            <Badge
              variant="outline"
              className={`gap-1.5 rounded-full border-border bg-card px-3 py-1 text-muted-foreground ${
                account.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  account.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {account.status === 'connected' ? 'Connected' : account.status}
            </Badge>
          )}
        </header>

        {!account ? (
          /* ================= SETUP WIZARD ================= */
          <SetupWizard
            phoneNumberId={phoneNumberId}
            setPhoneNumberId={setPhoneNumberId}
            accessToken={accessToken}
            setAccessToken={setAccessToken}
            businessName={businessName}
            setBusinessName={setBusinessName}
            saving={saving}
            onSave={saveCredentials}
            ownerNumber={OWNER_NUMBER}
          />
        ) : (
          /* ================= DASHBOARD ================= */
          <div className="space-y-6">
            {/* Connection checklist */}
            <section
              className="rounded-2xl border border-border bg-card/60 p-5"
              aria-label="Connection status"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <StatusCheck
                  ok
                  title="Credentials"
                  detail={
                    account.displayPhone
                      ? fmtPhone(account.displayPhone)
                      : `ID …${account.phoneNumberId.slice(-6)}`
                  }
                />
                <StatusCheck
                  ok={lastOutWasSent || testSent}
                  title="Sending"
                  detail={
                    lastOutWasSent || testSent
                      ? 'Test message delivered'
                      : 'Send a test message below'
                  }
                />
                <StatusCheck
                  ok={account.webhookVerified}
                  title="Auto-reply (webhook)"
                  detail={
                    account.webhookVerified
                      ? 'Meta confirmed the webhook ✓'
                      : 'Needs webhook setup + public URL'
                  }
                />
              </div>

              {/* Webhook config helper — shown until Meta verifies our webhook */}
              {!account.webhookVerified && (
                <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-400/10 p-4">
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-200">
                    <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" aria-hidden />
                    <span>
                      <strong>Activate auto-reply:</strong> in the Meta console open{' '}
                      <em>WhatsApp → Configuration</em>, click <em>Edit</em> next to Webhook, paste
                      the two values below, press <em>Verify and save</em>, then subscribe to the{' '}
                      <em>messages</em> field. The webhook only receives events on your deployed
                      (public) URL — e.g. your Vercel app.
                    </span>
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <CopyField label="Callback URL" value={webhookUrl} onCopy={copy} />
                    <CopyField label="Verify token" value={account.verifyToken} onCopy={copy} />
                  </div>
                </div>
              )}
            </section>

            {/* ---------- Tabs ---------- */}
            <Tabs defaultValue="inbox">
              <TabsList className="rounded-xl">
                <TabsTrigger value="inbox" className="gap-1.5 rounded-lg text-xs">
                  <ChatCircleDots className="h-3.5 w-3.5" aria-hidden /> Inbox
                </TabsTrigger>
                <TabsTrigger value="agent" className="gap-1.5 rounded-lg text-xs">
                  <Gear className="h-3.5 w-3.5" aria-hidden /> Agent
                </TabsTrigger>
                <TabsTrigger value="test" className="gap-1.5 rounded-lg text-xs">
                  <PaperPlaneTilt className="h-3.5 w-3.5" aria-hidden /> Test
                </TabsTrigger>
              </TabsList>

              {/* ---- INBOX ---- */}
              <TabsContent value="inbox" className="mt-4">
                {conversations.length === 0 ? (
                  <EmptyInbox ownerNumber={OWNER_NUMBER} />
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    {/* conversation list */}
                    <div className="max-h-96 overflow-y-auto rounded-2xl border border-border bg-card/60 p-2 omni-scroll">
                      {conversations.map((conv) => (
                        <button
                          key={conv.peer}
                          onClick={() => setActivePeer(conv.peer)}
                          className={`mb-1 w-full rounded-xl p-3 text-left transition hover:bg-secondary/60 ${
                            activePeer === conv.peer ? 'bg-secondary' : ''
                          }`}
                          aria-label={`Conversation with ${fmtPhone(conv.peer)}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">
                              {fmtPhone(conv.peer)}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {timeAgo(conv.lastAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {conv.lastDirection === 'out' ? 'You: ' : ''}
                            {conv.lastBody}
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* message thread */}
                    <div className="flex max-h-96 flex-col rounded-2xl border border-border bg-card/60 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {activePeer ? fmtPhone(activePeer) : '—'}
                      </p>
                      <div className="omni-scroll flex-1 space-y-2 overflow-y-auto pr-1">
                        {activeMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                                msg.direction === 'out'
                                  ? 'rounded-br-md bg-emerald-500/90 text-white'
                                  : 'rounded-bl-md bg-secondary text-secondary-foreground'
                              }`}
                            >
                              {msg.body}
                              <span
                                className={`mt-1 block text-right text-[10px] ${
                                  msg.direction === 'out' ? 'text-emerald-100/80' : 'text-muted-foreground'
                                }`}
                              >
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {msg.direction === 'out' && msg.status === 'failed' ? ' · failed' : ''}
                              </span>
                            </div>
                          </div>
                        ))}
                        {activeMessages.length === 0 && (
                          <p className="py-8 text-center text-xs text-muted-foreground">
                            No messages yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ---- AGENT ---- */}
              <TabsContent value="agent" className="mt-4">
                <section className="rounded-2xl border border-border bg-card/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Auto-reply</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        When a customer messages you, NEXUS thinks and answers instantly.
                      </p>
                    </div>
                    <Switch
                      checked={autoReply}
                      onCheckedChange={(checked) => {
                        setAutoReply(checked)
                        saveSettings({ autoReply: checked })
                      }}
                      aria-label="Toggle auto-reply"
                    />
                  </div>

                  <div className="mt-5">
                    <Label htmlFor="wa-business-name" className="text-xs">
                      Business name (shown to customers)
                    </Label>
                    <Input
                      id="wa-business-name"
                      value={account.businessName}
                      onChange={(e) =>
                        setAccount((prev) => (prev ? { ...prev, businessName: e.target.value } : prev))
                      }
                      className="mt-1.5 rounded-xl"
                      maxLength={60}
                    />
                  </div>

                  <div className="mt-4">
                    <Label htmlFor="wa-agent-prompt" className="text-xs">
                      Agent persona — how NEXUS should reply
                    </Label>
                    <Textarea
                      id="wa-agent-prompt"
                      value={agentPrompt}
                      onChange={(e) => {
                        setAgentPrompt(e.target.value)
                        setPromptDirty(true)
                      }}
                      placeholder={`Leave empty to use the default: short, friendly, replies in the customer's language, never invents facts.`}
                      className="mt-1.5 min-h-36 rounded-xl text-sm"
                      maxLength={4000}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Example: “You are the assistant for Mounir’s phone repair shop in Dubai. Be
                      brief, quote pick-up within 2 hours, and reply in English or Arabic.”
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10px] text-muted-foreground">
                      Tip: temporary Meta tokens expire after 24h — if replies stop, paste a fresh
                      token via Test → Update credentials.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={disconnect}
                        className="rounded-lg text-xs hover:border-destructive/40 hover:text-destructive"
                      >
                        Disconnect
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveSettings()}
                        disabled={savingSettings || !promptDirty}
                        className="gap-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-xs text-white hover:from-emerald-400 hover:to-teal-400"
                      >
                        {savingSettings ? (
                          <SpinnerGap className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Save changes
                      </Button>
                    </div>
                  </div>
                </section>
              </TabsContent>

              {/* ---- TEST ---- */}
              <TabsContent value="test" className="mt-4">
                <TestPanel
                  testTo={testTo}
                  setTestTo={setTestTo}
                  testMsg={testMsg}
                  setTestMsg={setTestMsg}
                  sending={sending}
                  onSend={sendTest}
                  ownerNumber={OWNER_NUMBER}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}

/* ================================================================== */
/* Setup wizard                                                        */
/* ================================================================== */

function SetupWizard(props: {
  phoneNumberId: string
  setPhoneNumberId: (v: string) => void
  accessToken: string
  setAccessToken: (v: string) => void
  businessName: string
  setBusinessName: (v: string) => void
  saving: boolean
  onSave: () => void
  ownerNumber: string
}) {
  const {
    phoneNumberId,
    setPhoneNumberId,
    accessToken,
    setAccessToken,
    businessName,
    setBusinessName,
    saving,
    onSave,
    ownerNumber,
  } = props

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Legal reassurance banner */}
      <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-emerald-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" weight="fill" aria-hidden />
          <span>
            <strong>Starting as an individual is officially supported.</strong> Meta gives every
            developer a free test number that can message up to <strong>5 verified numbers</strong>{' '}
            — no business documents, no verification, no cost. Perfect for testing NEXUS with your
            own number. You only need to think about licenses (e.g. Dubai&apos;s eTrader) when you
            start selling to real customers at scale.
          </span>
        </p>
      </div>

      {/* Step 1 */}
      <WizardStep
        step={1}
        title="Create a free Meta developer app"
        icon={<WhatsappLogo className="h-4 w-4 text-emerald-400" weight="fill" aria-hidden />}
      >
        <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground marker:text-emerald-400">
          <li>
            Go to{' '}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
            >
              developers.facebook.com/apps
            </a>{' '}
            and click <strong>Create App</strong> (use your personal Facebook account).
          </li>
          <li>
            App type: <strong>Business</strong> → give it any name (e.g. “NEXUS”).
          </li>
          <li>
            In the app dashboard find <strong>Add Product</strong> → click{' '}
            <strong>Set up</strong> on the WhatsApp card.
          </li>
        </ol>
      </WizardStep>

      {/* Step 2 */}
      <WizardStep
        step={2}
        title="Copy your test number credentials"
        icon={<Clipboard className="h-4 w-4 text-emerald-400" aria-hidden />}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          Meta automatically gives every app a <strong>free test phone number</strong>. Open{' '}
          <strong>WhatsApp → API Setup</strong> in the left menu and copy:
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li className="rounded-lg bg-secondary/50 px-3 py-2">
            <strong>Phone number ID</strong> — a long number under “Phone number ID” (not the phone
            number itself).
          </li>
          <li className="rounded-lg bg-secondary/50 px-3 py-2">
            <strong>Access token</strong> — under “Temporary access token” (expires in 24h — fine
            for testing; you can extend it later).
          </li>
        </ul>
      </WizardStep>

      {/* Step 3 */}
      <WizardStep
        step={3}
        title="Paste them into NEXUS"
        icon={<Plug className="h-4 w-4 text-emerald-400" aria-hidden />}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="wa-pnid" className="text-xs">
              Phone number ID
            </Label>
            <Input
              id="wa-pnid"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="e.g. 123456789012345"
              inputMode="numeric"
              className="mt-1.5 rounded-xl"
              aria-describedby="wa-pnid-hint"
            />
            <p id="wa-pnid-hint" className="mt-1 text-[10px] text-muted-foreground">
              Digits only — copy it exactly from the API Setup tab.
            </p>
          </div>
          <div>
            <Label htmlFor="wa-token" className="text-xs">
              Access token
            </Label>
            <Input
              id="wa-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="EAAG… (long string)"
              className="mt-1.5 rounded-xl font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Stored encrypted on your machine — never shared.
            </p>
          </div>
          <div>
            <Label htmlFor="wa-bname" className="text-xs">
              Business name (what customers see)
            </Label>
            <Input
              id="wa-bname"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1.5 rounded-xl"
              maxLength={60}
            />
          </div>
          <Button
            onClick={onSave}
            disabled={saving || !phoneNumberId || !accessToken}
            className="gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 px-6 text-white hover:from-emerald-400 hover:to-teal-400"
          >
            {saving ? (
              <SpinnerGap className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle className="h-4 w-4" aria-hidden />
            )}
            Connect WhatsApp
          </Button>
        </div>
      </WizardStep>

      {/* Step 4 preview */}
      <WizardStep
        step={4}
        title="Send yourself a test message"
        icon={<PaperPlaneTilt className="h-4 w-4 text-emerald-400" aria-hidden />}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          After connecting, NEXUS can send to numbers you verified in the Meta console.{' '}
          {ownerNumber ? (
            <>
              Your number <strong>{fmtPhone(ownerNumber)}</strong> is pre-filled — in the Meta console{' '}
            </>
          ) : (
            <>In the Meta console{' '}</>
          )}
          (API Setup → <em>To</em> field → <em>Manage phone number list</em>) add it and enter the OTP WhatsApp
          sends you. Then hit <strong>Send test</strong>.
        </p>
      </WizardStep>
    </motion.div>
  )
}

/* ================================================================== */
/* Small building blocks                                               */
/* ================================================================== */

function WizardStep(props: {
  step: number
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-5">
      <h3 className="mb-3 flex items-center gap-2.5 text-sm font-semibold">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
          {props.step}
        </span>
        {props.icon}
        {props.title}
      </h3>
      {props.children}
    </section>
  )
}

function StatusCheck(props: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/70 p-3">
      {props.ok ? (
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" weight="fill" aria-hidden />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold">{props.title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{props.detail}</p>
      </div>
    </div>
  )
}

function CopyField(props: { label: string; value: string; onCopy: (text: string, label: string) => void }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {props.label}
        </p>
        <button
          onClick={() => props.onCopy(props.value, props.label)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-emerald-400 transition hover:bg-emerald-400/10"
          aria-label={`Copy ${props.label}`}
        >
          <Copy className="h-3 w-3" aria-hidden /> Copy
        </button>
      </div>
      <p className="mt-1 truncate font-mono text-[11px]">{props.value}</p>
    </div>
  )
}

function EmptyInbox(props: { ownerNumber: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-8 text-center">
      <ChatCircleDots className="mx-auto mb-3 h-8 w-8 text-emerald-400/60" aria-hidden />
      <h4 className="text-sm font-semibold">No conversations yet</h4>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        Send a test message{' '}
        {props.ownerNumber ? (
          <>
            to <strong>{fmtPhone(props.ownerNumber)}</strong>{' '}
          </>
        ) : null}
        from the <em>Test</em> tab. Once the webhook is configured, every customer message lands here and
        NEXUS replies automatically.
      </p>
    </div>
  )
}

function TestPanel(props: {
  testTo: string
  setTestTo: (v: string) => void
  testMsg: string
  setTestMsg: (v: string) => void
  sending: boolean
  onSend: () => void
  ownerNumber: string
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-5">
      <h3 className="text-sm font-semibold">Send a test message</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Goes out from your Meta test number. In test mode the recipient must be verified in the
        Meta console (max 5 numbers).
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="wa-test-to" className="text-xs">
            To
          </Label>
          <Input
            id="wa-test-to"
            value={props.testTo}
            onChange={(e) => props.setTestTo(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="mt-1.5 rounded-xl"
            aria-label="Recipient phone number"
          />
        </div>
        <div>
          <Label htmlFor="wa-test-msg" className="text-xs">
            Message (optional)
          </Label>
          <Input
            id="wa-test-msg"
            value={props.testMsg}
            onChange={(e) => props.setTestMsg(e.target.value)}
            placeholder="Default: a friendly NEXUS test message"
            className="mt-1.5 rounded-xl"
            maxLength={1500}
          />
        </div>
        <Button
          onClick={props.onSend}
          disabled={props.sending}
          className="gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400"
        >
          {props.sending ? (
            <SpinnerGap className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <PaperPlaneTilt className="h-4 w-4" aria-hidden />
          )}
          Send
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ArrowSquareOut className="h-3 w-3" aria-hidden />
        {props.ownerNumber
          ? `Your number ${fmtPhone(props.ownerNumber)} must be added under Meta console → WhatsApp → API Setup → To → Manage phone number list (OTP verification).`
          : 'Your WhatsApp number must be added under Meta console → WhatsApp → API Setup → To → Manage phone number list (OTP verification).'}
      </p>
    </section>
  )
}
