import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy · NEXUS',
  description:
    'How NEXUS handles your data: encrypted social connections, zero-knowledge OAuth, and full control over everything you connect.',
}

/* Static, premium dark page — matches the NEXUS One shell. */

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What we store',
    body: [
      'Your account: an email address and a password (stored only as a secure hash).',
      'Your NEXUS content: chats, generated posts, images, drafts and settings.',
      'Social connections: when you connect Instagram, Facebook, LinkedIn or X, NEXUS stores the official access token those platforms issue — encrypted with AES-256-GCM before it touches the database. Tokens are never displayed, exported or shared.',
    ],
  },
  {
    title: 'What we never store',
    body: [
      'Your passwords for Instagram, Facebook, LinkedIn or X. Connecting an account happens entirely on the platform\u2019s own sign-in page — you never type a social password into NEXUS.',
      'Your social API keys, tokens or secrets in plain text. There is nothing for you to copy, paste or manage.',
    ],
  },
  {
    title: 'What the agent does with a connection',
    body: [
      'With your connected account, the NEXUS agent can research trends, draft posts, publish them, and reply to comments — within the permissions you approved on the platform\u2019s consent screen.',
      'You can switch autopilot off, disconnect an account, or delete any post at any time from the Social Autopilot panel.',
    ],
  },
  {
    title: 'Third-party platforms',
    body: [
      'Connecting a social account authorizes NEXUS according to that platform\u2019s own terms: Meta (Instagram, Facebook), LinkedIn, and X each process the sign-in on their own pages and set their own policies for the data they share with apps.',
      'Removing the connection in NEXUS deletes the stored token immediately. You can also revoke NEXUS from the platform\u2019s "connected apps" settings at any time.',
    ],
  },
  {
    title: 'AI providers',
    body: [
      'To generate content, NEXUS sends the relevant prompt or draft to AI providers (such as OpenRouter, Google Gemini and Groq). Prompts are used to answer you, not to advertise to you.',
    ],
  },
  {
    title: 'Your control',
    body: [
      'Disconnect any social account with one tap — the stored token is deleted on the spot.',
      'Delete your NEXUS account to remove your account data, chats, drafts and every stored connection.',
      'Questions? Reach us from inside the app — the concierge answers instantly.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#0b0b0d] px-4 py-12 text-zinc-100 antialiased">
      <article className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">NEXUS · Legal</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The short version: your social tokens are encrypted end-to-end before storage, your platform passwords
          never touch NEXUS, and every connection can be removed with one tap.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title} aria-label={s.title}>
              <h2 className="text-base font-semibold text-zinc-100">{s.title}</h2>
              <div className="mt-2 space-y-2">
                {s.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-zinc-400">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
          Last updated: November 2025 · nexus-ai-lime-iota.vercel.app
        </p>
      </article>
    </main>
  )
}
