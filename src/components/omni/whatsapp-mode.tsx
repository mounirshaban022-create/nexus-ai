'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Loader2, MessageCircle, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* WhatsApp Agent mode — one-tap rehearsal connect, live Meta later.   */
/*                                                                     */
/* Default path (the owner is not technical):                          */
/*   • ONE TAP → rehearsal account with zero credentials. The full     */
/*     agent pipeline runs on simulated chats; nothing is sent to      */
/*     real customers until live credentials are added.                */
/*   • "Live setup" tab hides the Meta developer steps under an        */
/*     advanced, plain-English guide for when the owner wants to go    */
/*     on-air for real.                                                */
/* ------------------------------------------------------------------ */

const OWNER_NUMBER = '971509376042'
/** Server-side constant for the rehearsal demo customer (messages route). */
const DEMO_CUSTOMER = '971500000001'

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

function peerName(peer: string): string {
  return peer === DEMO_CUSTOMER ? 'Demo Customer' : fmtPhone(peer)
}

export default function WhatsAppMode() {
  const { toast } = useToast()

  /* ------------------------------ state ------------------------------ */
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<WaAccount | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')

  // One-tap connect
  const [connecting, setConnecting] = useState(false)

  // Agent persona
  const [autoReply, setAutoReply] = useState(true)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [promptDirty, setPromptDirty] = useState(false)
  const promptDirtyRef = useRef(false)
  const [savingPrompt, setSavingPrompt] = useState(false)

  // Live setup (advanced)
  const [livePhoneId, setLivePhoneId] = useState('')
  const [liveToken, setLiveToken] = useState('')
  const [goingLive, setGoingLive] = useState(false)

  // Inbox
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activePeer, setActivePeer] = useState<string | null>(null)

  // Demo chat (rehearsal)
  const [demoText, setDemoText] = useState('')
  const [sendingDemo, setSendingDemo] = useState(false)

  // Test send (live)
  const [testTo, setTestTo] = useState(OWNER_NUMBER)
  const [testMsg, setTestMsg] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  /* ------------------------------ data ------------------------------ */

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/account')
      if (res.ok) {
        const data = (await res.json()) as { account: WaAccount | null; webhookUrl?: string }
        setAccount(data.account)
        setWebhookUrl(data.webhookUrl ?? '')
        if (data.account) {
          setAutoReply(data.account.autoReply)
          if (!promptDirtyRef.current) setAgentPrompt(data.account.agentPrompt ?? '')
        }
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/messages')
      if (res.ok) {
        const data = (await res.json()) as {
          messages?: WaMessage[]
          conversations?: Conversation[]
        }
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

  const connectOneTap = useCallback(async () => {
    setConnecting(true)
    try {
      const res = await fetch('/api/whatsapp/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rehearsal: true,
          phoneNumberId: '',
          businessName: 'NEXUS Assistant',
          agentPrompt: '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not connect.')
      toast({
        title: 'WhatsApp connected ✓',
        description: 'The agent is live in rehearsal mode.',
      })
      await loadAccount()
    } catch (error) {
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setConnecting(false)
    }
  }, [toast, loadAccount])

  const disconnect = useCallback(async () => {
    try {
      await fetch('/api/whatsapp/account', { method: 'DELETE' })
      setAccount(null)
      setMessages([])
      setConversations([])
      setActivePeer(null)
      setAgentPrompt('')
      setPromptDirty(false)
      promptDirtyRef.current = false
      toast({ title: 'WhatsApp disconnected' })
      await loadAccount()
    } catch {
      toast({ title: 'Could not disconnect', variant: 'destructive' })
    }
  }, [toast, loadAccount])

  const toggleAutoReply = useCallback(
    async (checked: boolean) => {
      setAutoReply(checked)
      try {
        const res = await fetch('/api/whatsapp/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoReply: checked }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Save failed')
        setAccount(data.account)
      } catch (error) {
        setAutoReply((prev) => !checked)
        toast({
          title: 'Could not save',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  const savePrompt = useCallback(async () => {
    setSavingPrompt(true)
    try {
      const res = await fetch('/api/whatsapp/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setAccount(data.account)
      setPromptDirty(false)
      promptDirtyRef.current = false
      toast({ title: 'Saved ✓ — the agent uses this on every reply.' })
    } catch (error) {
      toast({
        title: 'Could not save',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSavingPrompt(false)
    }
  }, [agentPrompt, toast])

  const saveLiveCredentials = useCallback(async () => {
    const phoneId = livePhoneId.trim()
    const token = liveToken.trim()
    if (phoneId.length < 4) {
      toast({
        title: 'Phone Number ID looks too short',
        description: 'Copy the long number from Meta → WhatsApp → API Setup.',
        variant: 'destructive',
      })
      return
    }
    if (token.length < 20) {
      toast({
        title: 'Access token looks too short',
        description: 'Paste the full token from Meta → WhatsApp → API Setup.',
        variant: 'destructive',
      })
      return
    }
    setGoingLive(true)
    try {
      const res = await fetch('/api/whatsapp/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: phoneId,
          accessToken: token,
          businessName: account?.businessName || 'NEXUS Assistant',
          agentPrompt: account?.agentPrompt || '',
          rehearsal: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Meta rejected these credentials.')
      setLiveToken('')
      toast({ title: 'Live connected — Meta verified your number.' })
      await loadAccount()
    } catch (error) {
      toast({
        title: 'Could not go live',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setGoingLive(false)
    }
  }, [livePhoneId, liveToken, account, toast, loadAccount])

  const sendDemo = useCallback(async () => {
    const text = demoText.trim()
    if (!text || sendingDemo) return
    setSendingDemo(true)
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, demo: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send.')
      setDemoText('')
      setMessages(data.messages ?? [])
      setConversations(data.conversations ?? [])
      setActivePeer((prev) => prev ?? DEMO_CUSTOMER)
    } catch (error) {
      toast({
        title: 'Demo message failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSendingDemo(false)
    }
  }, [demoText, sendingDemo, toast])

  const sendTest = useCallback(async () => {
    const to = testTo.replace(/[^\d]/g, '')
    if (to.length < 8) {
      toast({ title: 'Enter a valid phone number', variant: 'destructive' })
      return
    }
    setSendingTest(true)
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: testMsg.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setTestMsg('')
      await loadMessages()
      toast({
        title: 'Message sent ✓',
        description: `Delivered to ${fmtPhone(to)} — check WhatsApp.`,
      })
    } catch (error) {
      toast({
        title: 'Test message failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSendingTest(false)
    }
  }, [testTo, testMsg, toast, loadMessages])

  /* ------------------------------ derived ------------------------------ */

  const activeMessages = useMemo(
    () => (activePeer ? messages.filter((m) => m.from === activePeer || m.to === activePeer) : []),
    [messages, activePeer]
  )

  const rehearsal = account?.status === 'pending'

  /* ------------------------------ render ------------------------------ */

  if (loading) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        {/* ---------- Status row (title lives in the framed panel) ---------- */}
        {account && (
          <header className="flex flex-wrap items-center justify-end gap-3">
            <Badge
              variant="outline"
              className="gap-1.5 rounded-full border-border/60 bg-card px-3 py-1 text-xs"
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  account.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                )}
                aria-hidden
              />
              <span className={account.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
                {account.status === 'connected' ? 'Live' : 'Rehearsal'}
              </span>
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={disconnect}
              aria-label="Disconnect WhatsApp"
              title="Disconnect"
              className="h-10 w-10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </header>
        )}

        {!account ? (
          /* ================= ONE-TAP CONNECT ================= */
          <ConnectCard connecting={connecting} onConnect={connectOneTap} />
        ) : (
          /* ================= DASHBOARD ================= */
          <div className="space-y-5">
            {/* 1) Compact status strip */}
            <section aria-label="Connection status" className="flex flex-wrap gap-2">
              <StatusChip
                label="Phone"
                value={account.displayPhone ? fmtPhone(account.displayPhone) : 'Rehearsal number'}
              />
              <StatusChip label="Auto-reply" value={autoReply ? 'on' : 'off'} />
              <StatusChip
                label="Receiving"
                value={account.webhookVerified ? 'Meta webhook verified ✓' : 'Rehearsal chats'}
              />
            </section>

            {/* 2) Agent persona */}
            <section className="rounded-2xl border border-border/60 bg-card/60 p-5" aria-label="Agent persona">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  How the agent sounds
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Auto-reply {autoReply ? 'on' : 'off'}
                  </span>
                  <Switch
                    checked={autoReply}
                    onCheckedChange={toggleAutoReply}
                    aria-label="Toggle auto-reply"
                  />
                </div>
              </div>
              <Textarea
                value={agentPrompt}
                onChange={(e) => {
                  setAgentPrompt(e.target.value)
                  setPromptDirty(true)
                  promptDirtyRef.current = true
                }}
                rows={4}
                maxLength={4000}
                placeholder="You are the WhatsApp assistant for a small business in Dubai. Reply quickly, warmly and professionally."
                className="mt-3 rounded-xl text-sm"
                aria-label="Agent persona"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Write it like you&apos;d brief a new hire — the agent uses it for every reply.
                </p>
                <Button
                  onClick={savePrompt}
                  disabled={savingPrompt || !promptDirty}
                  className="min-h-10 gap-1.5 rounded-xl bg-emerald-500 px-4 text-white hover:bg-emerald-400"
                >
                  {savingPrompt ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Save
                </Button>
              </div>
            </section>

            {/* 3) Tabs: Inbox | Live setup */}
            <Tabs defaultValue="inbox">
              <TabsList className="rounded-xl">
                <TabsTrigger value="inbox" className="min-h-10 rounded-lg px-4 text-xs">
                  Inbox
                </TabsTrigger>
                <TabsTrigger value="live" className="min-h-10 rounded-lg px-4 text-xs">
                  Live setup
                </TabsTrigger>
              </TabsList>

              {/* ---- INBOX ---- */}
              <TabsContent value="inbox" className="mt-4 space-y-4">
                {conversations.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-card/60 p-8 text-center">
                    <MessageCircle className="mx-auto mb-3 h-8 w-8 text-emerald-400/60" aria-hidden />
                    <h4 className="text-sm font-semibold">No conversations yet</h4>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                      {rehearsal
                        ? 'Nothing is sent to real customers in rehearsal mode. Type what a customer would say below and watch the agent answer.'
                        : 'Send a test message below — every customer reply will land in this inbox.'}
                    </p>
                    {rehearsal && (
                      <div className="mt-5 text-left">
                        <DemoRow
                          value={demoText}
                          sending={sendingDemo}
                          onValueChange={setDemoText}
                          onSend={sendDemo}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    {/* conversation list */}
                    <div className="omni-scroll max-h-96 overflow-y-auto rounded-2xl border border-border/60 bg-card/60 p-2">
                      {conversations.map((conv) => (
                        <button
                          key={conv.peer}
                          onClick={() => setActivePeer(conv.peer)}
                          className={cn(
                            'mb-1 w-full rounded-xl p-3 text-left transition hover:bg-secondary/60',
                            activePeer === conv.peer && 'bg-secondary'
                          )}
                          aria-label={`Conversation with ${peerName(conv.peer)}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                              {peerName(conv.peer)}
                              {conv.peer === DEMO_CUSTOMER && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-amber-300/40 bg-amber-400/10 px-1.5 py-0 text-[10px] text-amber-400"
                                >
                                  Demo
                                </Badge>
                              )}
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
                    <div className="flex max-h-96 flex-col rounded-2xl border border-border/60 bg-card/60 p-4">
                      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {activePeer ? peerName(activePeer) : '—'}
                        {activePeer === DEMO_CUSTOMER && (
                          <Badge
                            variant="outline"
                            className="rounded-full border-amber-300/40 bg-amber-400/10 px-1.5 py-0 text-[10px] text-amber-400"
                          >
                            Demo
                          </Badge>
                        )}
                      </p>
                      <div className="omni-scroll flex-1 space-y-2 overflow-y-auto pr-1">
                        {activeMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={cn(
                                'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
                                msg.direction === 'out'
                                  ? 'rounded-br-md bg-emerald-500/90 text-white'
                                  : 'rounded-bl-md bg-secondary text-secondary-foreground'
                              )}
                            >
                              {msg.body}
                              <span
                                className={cn(
                                  'mt-1 block text-right text-[10px]',
                                  msg.direction === 'out'
                                    ? 'text-emerald-100/80'
                                    : 'text-muted-foreground'
                                )}
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

                {/* bottom row — demo chat in rehearsal, real test send when live */}
                {rehearsal ? (
                  conversations.length > 0 && (
                    <DemoRow
                      value={demoText}
                      sending={sendingDemo}
                      onValueChange={setDemoText}
                      onSend={sendDemo}
                    />
                  )
                ) : (
                  <TestRow
                    testTo={testTo}
                    onTestToChange={setTestTo}
                    testMsg={testMsg}
                    onTestMsgChange={setTestMsg}
                    sending={sendingTest}
                    onSend={sendTest}
                  />
                )}
              </TabsContent>

              {/* ---- LIVE SETUP (advanced) ---- */}
              <TabsContent value="live" className="mt-4 space-y-5">
                <section
                  className="rounded-2xl border border-border/60 bg-card/60 p-5"
                  aria-label="Go live guide"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Go live in 3 steps
                  </p>
                  <ol className="mt-3 space-y-3">
                    {[
                      'Create a free Meta developer app and add the WhatsApp product — you get a free test number, no business verification.',
                      'Copy the Phone Number ID and Access Token from WhatsApp → API Setup.',
                      "Paste them here. Then point Meta's webhook at this app (we give you both values below).",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                          {i + 1}
                        </span>
                        <p className="pt-0.5 text-xs leading-relaxed text-muted-foreground">{step}</p>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-5 space-y-3">
                    <div>
                      <Label htmlFor="wa-live-pnid" className="text-xs">
                        Phone Number ID
                      </Label>
                      <Input
                        id="wa-live-pnid"
                        value={livePhoneId}
                        onChange={(e) => setLivePhoneId(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="e.g. 123456789012345"
                        inputMode="numeric"
                        className="mt-1.5 min-h-10 rounded-xl"
                        aria-describedby="wa-live-pnid-hint"
                      />
                      <p id="wa-live-pnid-hint" className="mt-1 text-[11px] text-muted-foreground">
                        Digits only — copy it exactly from the API Setup tab.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="wa-live-token" className="text-xs">
                        Access Token
                      </Label>
                      <Input
                        id="wa-live-token"
                        type="password"
                        value={liveToken}
                        onChange={(e) => setLiveToken(e.target.value)}
                        placeholder="EAAG… (long string)"
                        className="mt-1.5 min-h-10 rounded-xl font-mono text-xs"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Stored encrypted on your machine — never shared.
                      </p>
                    </div>
                    <Button
                      onClick={saveLiveCredentials}
                      disabled={goingLive}
                      className="min-h-10 gap-2 rounded-xl bg-emerald-500 px-5 text-white hover:bg-emerald-400"
                    >
                      {goingLive && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      Save live credentials
                    </Button>
                  </div>
                </section>

                {/* Webhook helper — only until Meta verifies the webhook */}
                {account && !account.webhookVerified && (
                  <section
                    className="rounded-2xl border border-border/60 bg-card/60 p-5"
                    aria-label="Webhook setup"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Webhook — so customer replies reach the agent
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      In the Meta console open <em>WhatsApp → Configuration</em>, paste these two
                      values, press <em>Verify and save</em>, then subscribe to the{' '}
                      <em>messages</em> field.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <CopyField label="Callback URL" value={webhookUrl} />
                      <CopyField label="Verify token" value={account.verifyToken} />
                    </div>
                  </section>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}

/* ================================================================== */
/* One-tap connect card                                                */
/* ================================================================== */

function ConnectCard(props: { connecting: boolean; onConnect: () => void }) {
  return (
    <section
      className="rounded-2xl border border-border/60 bg-card/60 p-8 sm:p-10"
      aria-label="Connect WhatsApp"
    >
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
          <MessageCircle className="h-7 w-7 text-emerald-400" aria-hidden />
        </div>
        <h3 className="mt-4 text-xl font-bold">Connect WhatsApp</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          One tap — your agent starts answering customers 24/7.
        </p>
        <Button
          onClick={props.onConnect}
          disabled={props.connecting}
          className="mt-6 h-12 w-full max-w-sm rounded-xl bg-emerald-500 text-base font-semibold text-white hover:bg-emerald-400"
        >
          {props.connecting ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <MessageCircle className="h-5 w-5" aria-hidden />
          )}
          Connect WhatsApp — one tap
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No password · No tokens · No Meta developer account needed to start. Go live anytime
          from Live setup.
        </p>
      </div>
    </section>
  )
}

/* ================================================================== */
/* Small building blocks                                               */
/* ================================================================== */

function StatusChip(props: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="font-medium">{props.value}</span>
    </span>
  )
}

function DemoRow(props: {
  value: string
  sending: boolean
  onValueChange: (v: string) => void
  onSend: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Badge
          variant="outline"
          className="rounded-full border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-400"
        >
          Demo
        </Badge>
        <p className="text-xs text-muted-foreground">Try it — type what a customer would say:</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          props.onSend()
        }}
      >
        <Input
          value={props.value}
          onChange={(e) => props.onValueChange(e.target.value)}
          placeholder="e.g. Hi, are you open on Sundays?"
          maxLength={1000}
          className="min-h-10 flex-1 rounded-xl"
          aria-label="Demo customer message"
        />
        <Button
          type="submit"
          disabled={props.sending || !props.value.trim()}
          className="min-h-10 gap-1.5 rounded-xl bg-emerald-500 px-4 text-white hover:bg-emerald-400"
        >
          {props.sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Send
        </Button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Simulated chat — nothing is sent to real customers.
      </p>
    </div>
  )
}

function TestRow(props: {
  testTo: string
  onTestToChange: (v: string) => void
  testMsg: string
  onTestMsgChange: (v: string) => void
  sending: boolean
  onSend: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Send a test message
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          props.onSend()
        }}
      >
        <Input
          value={props.testTo}
          onChange={(e) => props.onTestToChange(e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          maxLength={20}
          className="min-h-10 rounded-xl sm:w-44"
          aria-label="Test recipient phone number"
        />
        <Input
          value={props.testMsg}
          onChange={(e) => props.onTestMsgChange(e.target.value)}
          placeholder="Message (optional — a friendly NEXUS hello)"
          maxLength={1500}
          className="min-h-10 flex-1 rounded-xl"
          aria-label="Test message"
        />
        <Button
          type="submit"
          disabled={props.sending}
          className="min-h-10 gap-1.5 rounded-xl bg-emerald-500 px-4 text-white hover:bg-emerald-400"
        >
          {props.sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Send
        </Button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Goes out from your live WhatsApp number — the recipient must be verified in the Meta
        console during the free test period.
      </p>
    </div>
  )
}

function CopyField(props: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(props.value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2_000)
      })
      .catch(() => {
        /* selection still possible — ignore */
      })
  }, [props.value])

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {props.label}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          readOnly
          value={props.value}
          className="min-h-10 flex-1 rounded-lg font-mono text-xs"
          aria-label={props.label}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          disabled={!props.value}
          className="h-10 w-10 shrink-0"
          aria-label={`Copy ${props.label}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  )
}

/* Named export kept for import-style compatibility with the mode shell. */
export { WhatsAppMode }
