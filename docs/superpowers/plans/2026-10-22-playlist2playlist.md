# playlist2playlist Implementation Plan

> Executed inline in the same session (owner asked to implement tonight). TDD for every
> `src/lib` module; UI verified in the browser. Spec:
> `docs/superpowers/specs/2026-10-22-playlist2playlist-design.md`.

**Goal:** Static page that copies a Spotify library between two accounts using the
post-February-2026 Web API, owner's Client ID by default.

**Architecture:** reader (source → Snapshot) and writer (Snapshot → destination) over an
injected HTTP client; React wizard orchestrates; everything in the browser.

**Tech stack:** Vite, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Zod 4, Biome,
Vitest, pnpm, GitHub Pages.

---

## File map

```
src/lib/chunk.ts              chunk<T>(items, size): T[][]
src/lib/snapshot.ts           SnapshotSchema, Snapshot, parseSnapshot, serializeSnapshot, Selection, ALL_SELECTED
src/lib/pkce.ts               createVerifier, challengeFromVerifier, buildAuthorizeUrl, SCOPES, Role
src/lib/auth.ts               startLogin, handleCallback, getAccessToken, clearAuth, hasToken, TokenStore
src/lib/spotify-api.ts        createClient({ fetch, getToken, sleep, signal }) → { get, post, put, paginate, cursorPaginate }, SpotifyApiError
src/lib/reader.ts             readLibrary, readCounts, Phase, Progress
src/lib/writer.ts             writeLibrary
src/lib/report.ts             Report, emptyReport
src/lib/progress-store.ts     createProgressStore(storage, key)
src/lib/config.ts             getClientId, setOwnClientId, redirectUri
src/lib/html.ts               decodeEntities
src/lib/download.ts           downloadJson(filename, data)
src/test/fake-spotify.ts      in-memory Spotify implementing the endpoints of spec §2
src/i18n/{en,es}.ts, i18n/index.tsx
src/app/state.ts              reducer, persisted state
src/app/App.tsx               layout, header, footer, step switch
src/steps/{Setup,ConnectOld,ConnectNew,Transfer,Done}.tsx
src/components/ui/*           shadcn
```

## Tasks

1. **Scaffold** — Vite React TS, Tailwind v4 (`@tailwindcss/vite`), shadcn init + button
   card checkbox progress alert input collapsible badge, Biome (no semicolons), Vitest,
   `base: "/playlist2playlist/"`, dev server host `127.0.0.1` port 5173, `.node-version`,
   AGPL `LICENSE`, `.gitignore`. Verify `pnpm build`, `pnpm test`, `pnpm lint`. Commit.
2. **chunk + html** — tests: exact sizes, remainder, empty, size ≤ 0 throws; entities
   `&amp; &#x27; &quot; &#39; &lt; &gt;` decoded once. Commit.
3. **snapshot** — tests: valid round-trip; unknown version rejected with message;
   missing fields rejected; `addedAt` null accepted. Commit.
4. **pkce** — tests: RFC 7636 vector (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` →
   `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`); verifier length 64 and URL-safe;
   authorize URL has client_id, response_type=code, redirect_uri, code_challenge_method=S256,
   scope per role, state, show_dialog=true. Commit.
5. **spotify-api** — tests with fake fetch: bearer header; JSON body; `paginate` follows
   `next` until null; `cursorPaginate` follows `cursors.after` under `artists`; 429 waits
   Retry-After+1 s; 5xx backoff 1/2/4/8 s then throws; 401 refreshes once then retries;
   second 401 throws; abort rejects; 204/empty body returns null. Commit.
6. **auth** — tests with fake storage + fetch: startLogin stores verifier/nonce under role and
   returns URL; handleCallback rejects bad state, exchanges code, stores tokens with
   expiresAt; getAccessToken refreshes when < 5 min or forced; clearAuth wipes. Commit.
7. **fake-spotify + reader** — fake implements GET /me, /me/playlists, /playlists/{id}/items,
   /me/tracks, /me/albums, /me/following, POST /me/playlists, POST /playlists/{id}/items,
   PUT /me/library, GET /me/library/contains with the real limits (50/100/40) and 400 on
   violations. Reader tests: owned vs followed (collaborative not owned counts as followed),
   exclusions, local files kept, null items counted unavailable, entities decoded, selection
   respected (no calls for unselected), pagination over > 50 items, progress events.
   `readCounts` uses `total` of first pages. Commit.
8. **progress-store + report + writer** — tests: creates playlist with fields and adds items
   in 100s in order; local → skipped; same-name destination playlist → alreadyThere, untouched;
   followed playlists/liked/albums/artists use contains then PUT only missing in 40s; liked
   order oldest-first; re-run is a no-op (all alreadyThere); resume after simulated crash
   mid-playlist continues at stored count without duplicates; 400 on a chunk → api-error
   skipped and continues; abort → report.aborted. Round-trip test reader → writer over two
   fake accounts. Commit.
9. **config + download + i18n** — getClientId precedence (own > env > null); redirectUri
   normalisation; typed `es` against `en`. Commit.
10. **UI** — state reducer (tests for transitions and persistence), steps, App. Callback
    handling on load. 403 on /me → allow-list message. Verify at 390 px and desktop, EN/ES,
    with the fake API toggled by `?demo=1` (dev only) so the whole flow can be clicked
    without real accounts. Commit.
11. **README + CI** — README EN + ES, Pages workflow (lint, test, build with
    `VITE_SPOTIFY_CLIENT_ID`, deploy). Commit.
12. **Publish** — create public repo `esdedev/playlist2playlist`, push, enable Pages
    (Actions), check deploy URL loads.

## Spec coverage check

§2 endpoints → 5,7,8 · §4 snapshot/selection → 3,7 · §5 auth → 4,6,9,10 · §6 reader → 7 ·
§7 writer → 8 · §8 client → 5 · §9 report → 8,10 · §10 UI → 10 · §11 tests → all ·
§12 delivery → 11,12. Owner's manual step (create Spotify app, set variable) listed in README.
