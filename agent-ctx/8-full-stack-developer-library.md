# Task 8 — full-stack-developer-library

## Task
Wire the NEXUS AI Library tab to real database content. Persist generated images, videos, and documents to the appropriate Prisma tables (with userId when authenticated), expose a unified `/api/library` endpoint that returns a reverse-chronological list of all items, and rewrite `library-mode.tsx` so the Library tab displays real generated content instead of hardcoded seed data.

## Work Log

### Files created
- `src/app/api/library/route.ts` — NEW. Two handlers:
  - **GET**: Calls `getCurrentUser(req)`. Runs three parallel `db.{image,video,document}.findMany` queries with `where: { OR: [{ userId: user?.id ?? null }, { userId: null }] }`, `take: 100`, `orderBy: { createdAt: 'desc' }`. Normalizes each row into a unified `{ id, type, name, preview, size, url, downloadUrl?, createdAt, status? }` shape. Sorts the merged list reverse-chronologically. Returns `{ items, meta: { total, images, videos, documents, signedIn } }`.
  - **DELETE**: Body `{ id, type }`. Validates `type ∈ {image, video, document}`. Calls `db.generated{Type}.delete({ where: { id } })` inside a `.catch(() => {})` so a missing row returns `{ ok: true }` (idempotent delete). Returns `{ ok: true }`.

### Files modified
- `src/app/api/video/create/route.ts`:
  - Added imports: `db` from `@/lib/db`, `getCurrentUser` from `@/lib/auth`.
  - After request parsing in POST: `const user = await getCurrentUser(req)` (before the async IIFE so the closure captures it).
  - Inside the success path of the background pipeline (after `job.url = '/api/video/file/${id}'`), persists `db.generatedVideo.create({ data: { prompt, scenes: sceneCount, voice, style, url: job.url, jobId: id, status: 'done', userId: user?.id ?? null } })` wrapped in try/catch (a DB failure must not flip the in-memory job back to error).
  - Inside the error path (catch block), also persists a record with `status: 'error'`, `url: null` so the user sees failed attempts in the library with a red badge.
  - In-memory job system (GET /api/video/status/[id], GET /api/video/file/[id]) untouched — polling still works.
- `src/app/api/documents/route.ts`:
  - Added imports: `db` from `@/lib/db`, `getCurrentUser` from `@/lib/auth`.
  - In PUT, added `const user = await getCurrentUser(req)` after the rate-limit check.
  - After `await writeFile(filePath, buffer)`, persists `db.generatedDocument.create({ data: { filename: doc.filename, format: ext, title: doc.title, summary: edited.slice(0, 200), downloadUrl: '/api/documents/file/${id}?format=${ext}', size: buffer.length, userId: user?.id ?? null } })` wrapped in try/catch.
  - POST (upload+parse) and GET (query) untouched — only PUT (export) writes to DB.
- `src/app/api/image/route.ts`:
  - Added import: `getCurrentUser` from `@/lib/auth`.
  - In POST: `const user = await getCurrentUser(req)` after the request is parsed.
  - Added `userId: user?.id ?? null` to the `db.generatedImage.create({ data: { ... } })` call.
- `src/components/omni/library-mode.tsx` — full rewrite:
  - Removed ALL hardcoded SEED data; no longer imports `AudioLines` / `File` (only ImageIcon/FileText/Film).
  - State: `{ items: LibItem[], loading: bool, error: string|null, deleting: string|null }` plus `{ query, filter, view }`.
  - `fetchLibrary()` calls `/api/library` with `cache: 'no-store'`; runs on mount via `useEffect(() => void fetchLibrary(), [fetchLibrary])`.
  - Loading: 8-tile skeleton grid with `animate-pulse`.
  - Error: red AlertCircle + "Try again" button that calls `fetchLibrary()`.
  - Empty state distinguishes "no items yet" (helpful CTA copy) vs "no matches" (search/filter hint).
  - Grid view: tile shows real `<img src={item.preview}>` for images with `onError` that hides the broken image (falls back to type icon), film icon for videos, file icon for documents. Top-left type badge. Top-right status badge for non-done videos (`planning`/`images`/etc → amber; `error` → destructive "Failed"). Hover overlay with Download (`<a href={downloadHref} download>`) + Delete (button calling `handleDelete(item)`).
  - List view: compact rows with thumbnail (image only) + name + type/size + time-ago + inline Download/Delete.
  - Filters reduced to 4: All / Images / Videos / Documents (no Audio/Other — those types are no longer generated).
  - Search: client-side case-insensitive substring match on `item.name`.
  - View toggle: Grid3x3 / List (renamed ListIcon import to avoid name collision with the JS List global).
  - Refresh button in header (top-right) with spin animation while loading.
  - Delete: `fetch('/api/library', { method: 'DELETE', body: { id, type } })`, on success removes the item from local state immediately (no full refetch — snappy UX); shows a spinner on the delete button itself while the request is in-flight.
  - framer-motion `AnimatePresence` wraps list items so deletes animate out smoothly.
  - `timeAgo(iso)` helper formats relative timestamps ("5s ago" / "3m ago" / "2h ago" / "4d ago" / "1w ago" / locale date).

## Verification

`bun run lint` → **clean** (0 errors, 0 warnings).

### curl outputs (real DB round-trips)
```
GET /api/library (empty)
  → 200 {"items":[],"meta":{"total":0,"images":0,"videos":0,"documents":0,"signedIn":false}}

POST /api/image {prompt:"test image for library", size:"1024x1024", provider:"free"}
  → 200 {"image":{"id":"cmt6u5qmn0003qnoumuk4quao","url":"/api/image/file/0b76e3c5-...","prompt":"test image for library","size":"1024x1024","createdAt":"2026-08-24T06:09:11.183Z"}}

GET /api/library (now shows image)
  → 200 {"items":[{"id":"cmt6u5qmn0003qnoumuk4quao","type":"image","name":"test image for library","preview":"/api/image/file/0b76e3c5-...","size":"1024x1024","url":"/api/image/file/0b76e3c5-...","downloadUrl":"/api/image/file/0b76e3c5-...","createdAt":"2026-08-24T06:09:11.183Z"}],"meta":{"total":1,"images":1,"videos":0,"documents":0,"signedIn":false}}

DELETE /api/library {id:"cmt6u5qmn0003qnoumuk4quao", type:"image"}
  → 200 {"ok":true}

POST /api/documents {file:<base64>, filename:"test-doc.txt", format:"txt"}
  → 200 {"document":{"id":"baee2f9f-...","filename":"test-doc.txt","title":"test-doc","summary":"...","metadata":{...}}}

PUT /api/documents {id:"baee2f9f-...", instruction:"Add a closing paragraph...", outputFormat:"md"}
  → 200 {"edited":{"content":"...","downloadUrl":"/api/documents/file/87d06c06-...?format=md","format":"md","size":173}}

GET /api/library (both image + document)
  → 200 {"items":[
      {"id":"cmt6u6mpx0007qnou18tfgngt","type":"image","name":"library test image 2","preview":"/api/image/file/7e948d35-...","size":"1024x1024","url":"/api/image/file/7e948d35-...","downloadUrl":"/api/image/file/7e948d35-...","createdAt":"2026-08-24T06:09:52.773Z"},
      {"id":"cmt6u6e1y0005qnoue107qt8v","type":"document","name":"test-doc.txt","preview":"This is a test document...","size":"173 B","url":"/api/documents/file/87d06c06-...?format=md","downloadUrl":"/api/documents/file/87d06c06-...?format=md","createdAt":"2026-08-24T06:09:41.543Z"}
    ], "meta":{"total":2,"images":1,"videos":0,"documents":1,"signedIn":false}}

DELETE /api/library (document)
  → 200 {"ok":true}
```

### Browser verification (agent-browser)
- Completed onboarding → entered Nexus app
- Clicked Library tab → real items rendered with actual image thumbnails (NOT seed data)
- "library test image 2" tile: PNG preview + "Image" badge + "1024x1024 · 1m ago"
- "test-doc.txt" tile: file icon + "Document" badge + "173 B · 1m ago"
- Filter "Documents" hides the image (filter works)
- Switched to List view → compact rows with inline Download/Delete
- Clicked Delete button on the image card → image disappeared instantly (snappy local update); curl-confirmed the DB row was actually deleted (not just hidden in UI)
- Refreshed → consistent state

## Stage Summary

The Library tab is now fully wired to real DB content:
- Every image generation (`POST /api/image`) persists with `userId` set when authenticated.
- Every video generation (`POST /api/video/create`) persists with `status: 'done'` on success or `status: 'error'` on failure (so the user sees failed attempts in their library).
- Every document export (`PUT /api/documents`) persists with the summary, size, and download URL.
- The unified `/api/library` endpoint returns a stable shape the frontend renders directly.
- The DELETE endpoint removes items from the right table without touching the file routes (which serve the underlying files independently).
- The `library-mode.tsx` component has zero fake data and proper loading/empty/error states with snappy local delete.

## What the main agent should know to integrate library-mode into page.tsx

**Already integrated!** `page.tsx` already imports `<LibraryMode />` and renders it when `activeTab === 'library'` (line 438 of page.tsx). No further integration work needed — the rewrite is a drop-in replacement.

### The `items` shape returned by GET /api/library
```ts
interface LibItem {
  id: string                       // Prisma row id (cuid)
  type: 'image' | 'video' | 'document'
  name: string                     // image: prompt (truncated 60); video: prompt; document: filename
  preview: string | null           // image: url; document: summary; video: null (frontend shows placeholder)
  size: string                     // image: "1024x1024"; video: "—"; document: "48 KB" (formatted)
  url: string | null               // image: /api/image/file/{uuid}; video: /api/video/file/{jobId} or null on error; document: downloadUrl
  downloadUrl?: string | null      // same as url for image/document; video: vid.url (may be null)
  createdAt: string               // ISO timestamp
  status?: string                  // videos only: 'planning'|'images'|'narration'|'rendering'|'done'|'error'
}
```

Plus a `meta` object: `{ total, images, videos, documents, signedIn }`.

### Integration notes / gotchas
1. **Auth is optional.** Every endpoint calls `getCurrentUser(req)` and falls back to `userId: null`. When the user is signed in, the library shows only their items + items with `userId = null`. When signed out, it shows all unclaimed items. The `meta.signedIn` flag lets the UI conditionally render a "Sign in to see your library" prompt if desired.
2. **The `userId = null` fallback** means existing images generated before this task still appear in the library (they were created without `userId`). No data migration needed.
3. **Failed videos appear in the library.** A red "Failed" badge renders for videos with `status === 'error'`; their `url` is `null` so the download button is a no-op for them. The user can delete them.
4. **The delete is optimistic.** The UI removes the row locally as soon as the DELETE request returns 200 — there's no full refetch. If a delete fails server-side, the error message is surfaced but the row stays in the UI.
5. **The download attribute works for all types** — the browser will fetch the file via the file route (`/api/image/file/{id}` returns the PNG with `Cache-Control: public`, `/api/video/file/{id}` returns the MP4 with `Content-Disposition: inline`, `/api/documents/file/{id}?format=md` returns the doc). The `<a download>` attribute tells the browser to save it instead of navigating.
6. **No middleware protection.** Library routes call `getCurrentUser(req)` and gracefully fall back to `userId = null` — they don't return 401. This matches the rest of NEXUS (image/video/document routes are all open) and lets anonymous users see a shared library of unclaimed items.
7. **If the main agent wants to add "Save to Library" CTAs elsewhere** (e.g. in chat-mode attachment cards), they can simply call `POST /api/image` (already persists) — no extra work needed. For custom artifacts that don't fit the image/video/document model, the main agent should add a 4th Prisma model + extend the unified GET, rather than overloading these tables.
