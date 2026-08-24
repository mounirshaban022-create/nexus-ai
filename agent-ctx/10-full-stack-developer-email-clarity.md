# Task 10 — full-stack-developer (email clarity)

## Task
Frontend-only fix for the "no clear instructions on how to connect Gmail" complaint.
Surgically enhance `src/components/omni/connect-panel.tsx` so users see a prominent,
friendly Gmail setup guide BEFORE they attempt to connect (the backend already produces
good app-password error messages, but the user never got that far because they didn't
know they needed an App Password in the first place).

## What changed (single file)
- Added lucide imports: `ExternalLink`, `Info`, `KeyRound`.
- Added `SETUP_GUIDES` data map (gmail = full numbered walkthrough; outlook/yahoo/icloud/zoho = short App-Password callout with external link).
- Added a new `SetupGuide` sub-component (rendered via `<SetupGuide presetId={presetId} />` right under the preset selector). For Gmail it shows:
  * amber-highlighted box (`border-amber-500/30 bg-amber-500/5`)
  * KeyRound icon + "How to connect Gmail" title
  * intro line: "Gmail doesn't accept your normal password for apps. You need an App Password (16 characters)."
  * 4 numbered steps (2-Step Verification → app passwords page → create → paste below)
  * a 2-col Username/Password reminder grid (username = full Gmail address e.g. mounirshaban022@gmail.com; password = 16-char App Password)
  * external link button → https://myaccount.google.com/apppasswords (target=_blank, rel=noopener noreferrer)
  * For outlook/yahoo/icloud/zoho: same component, shorter (intro + external link only, Info icon instead of KeyRound).
- Hid the existing single-line `selectedPreset.hint` when a full guide is present (avoids duplication); it still shows for the `custom` preset.
- Username field: added gmail-only caption "Usually the same as your email for Gmail".
- Password field: label becomes "App Password (not your Gmail password)" when gmail preset (generic "Password / App password" otherwise); placeholder becomes "16-char app password" for gmail; added gmail-only caption "16 characters, looks like: abcd efgh ijkl mnop" (mono, amber).
- Error display: now a 2-line block — the backend `describeImapError` message (which explains App Passwords) on top + a smaller "Fix the credentials above and try again." hint below.
- Success display: now a prominent green block with CheckCircle2 + headline "Connected — your inbox is ready" + the backend success message as a detail line.
- Connect button label: "Connect Gmail" when gmail preset, "Connect account" otherwise.

## What did NOT change (confirmed)
- Component props / state management / submit flow untouched.
- `applyPreset` already auto-populates imapHost/port, smtpHost/port, smtpSecure from the preset and pre-fills username from email (`setUsername((prev) => prev || email)`) — kept as-is.
- Email-field onChange already mirrors email → username when username is empty or equal to a previous mirror (`if (!username || username === email) setUsername(e.target.value)`) — kept as-is; works for gmail (and all other providers where username = email).
- `submit()` posts the SAME payload to `/api/email/accounts`: `{ label, email, fromName, imapHost, imapPort, smtpHost, smtpPort, smtpSecure, username, password }` — unchanged.
- Backend (`src/lib/email.ts`, `src/app/api/email/accounts/route.ts`) untouched.

## Verification
- `bun run lint` → exit 0, zero errors/warnings.
- Dev server log shows `GET / 200` after edit (page compiles + renders fine).
- Only file touched: `src/components/omni/connect-panel.tsx`.
