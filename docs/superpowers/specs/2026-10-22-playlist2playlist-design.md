# playlist2playlist — design

Date: 2026-10-22. Status: approved by the owner (scope, stack, repo, licence, name,
architecture chosen in conversation; the owner asked to write, review, plan and implement
in one go).

## 1. Goal

A free, open-source, serverless web page that copies a Spotify library from one Spotify
account (the **source**) to another (the **destination**):

- playlists the source user owns → recreated in the destination (name, description,
  public/private, collaborative flag, items in their original order);
- playlists the source user follows but does not own → followed from the destination;
- Liked Songs → saved in the destination, oldest first;
- saved albums → saved in the destination;
- followed artists → followed from the destination.

It also lets the user download the source library as a JSON file ("snapshot") and later
import that file into a destination account, from any browser.

Success: a user with ~2,000 liked songs and ~30 playlists finishes the whole transfer in one
sitting, can re-run it without creating duplicates, and gets a report listing anything that
could not be copied.

### Out of scope (v1)

- Playlist cover images (the API only accepts base64 JPEG uploads and serves covers through
  temporary URLs).
- Listening history, recommendations, playlist followers, podcasts/shows/audiobooks saved in
  the library (episodes *inside* playlists are copied).
- Deleting anything from either account.
- Any service other than Spotify.

## 2. Hard constraints from the Spotify Web API (verified 2026-10-22)

- **No shared app.** Since 2025–2026, a Spotify app in Development Mode allows at most
  **5 authorized users**, one Development-Mode Client ID per developer, and requires Spotify
  Premium; Extended Quota is only granted to registered businesses with a large user base.
  Decision (owner, 2026-10-22): **users should not have to register as developers.**
  Therefore:
  - The deployed page ships with the **owner's Client ID** (build-time variable
    `VITE_SPOTIFY_CLIENT_ID`, a GitHub Actions repository variable; a Client ID is public by
    design in PKCE). Up to 5 accounts that the owner adds under *User Management* use the page
    with no setup at all. A person moving old → new uses 2 of those 5 slots; the owner can
    remove emails afterwards to free slots.
  - **Bring your own Client ID** stays as a folded "Advanced" option for everyone else (and is
    the only path when the build has no default Client ID, e.g. self-hosting).
  - An account that is not on the allow-list gets `403` from `GET /me`; the page explains
    it: "This account is not on the allow-list of this page. Ask the owner to add it, or use
    your own Client ID (Advanced)".
  - Rejected alternative: Spotify's private web-player API (no registration for anyone, but
    breaks Spotify's terms, risks users' accounts and breaks often).
- **February 2026 endpoint migration.** New Development-Mode apps get the new endpoints only.
  The tool uses exclusively:

  | Purpose | Endpoint |
  |---|---|
  | Who am I | `GET /me` |
  | List playlists (owned + followed) | `GET /me/playlists` (limit 50) |
  | Read playlist items (owned/collaborative only) | `GET /playlists/{id}/items` (limit 50; field `item`, not `track`) |
  | Liked Songs | `GET /me/tracks` (limit 50) |
  | Saved albums | `GET /me/albums` (limit 50) |
  | Followed artists | `GET /me/following?type=artist` (limit 50, cursor `after`) |
  | Create playlist | `POST /me/playlists` (body: name, description, public, collaborative) |
  | Add items | `POST /playlists/{id}/items` (JSON body `uris`, max 100) |
  | Save / follow anything | `PUT /me/library?uris=…` (query param, comma-separated, max 40 URIs; tracks, albums, artists, playlists) |
  | Check saved / followed | `GET /me/library/contains?uris=…` (max 40, returns `boolean[]`) |

  Removed endpoints that must **not** be used: `PUT /me/tracks`, `PUT /me/albums`,
  `PUT /me/following`, `PUT /playlists/{id}/followers`, `*/contains` variants,
  `POST /users/{id}/playlists`, `/playlists/{id}/tracks`.
- **Redirect URIs** must be HTTPS or a loopback IP (`http://127.0.0.1:<port>/`); `localhost`
  is rejected.
- Local files (`spotify:local:…`) cannot be added through the API.

## 3. Product decisions

| Decision | Choice |
|---|---|
| Scope v1 | Full library (owned playlists, followed playlists, liked, albums, artists) |
| Owned playlists | Copy |
| Others' playlists | Follow (not copy) |
| Login strategy | Both: guided one-pass flow (both accounts connected first, one button) **and** export/import JSON as a secondary path |
| UX principle | Simplest possible path for the user; options folded by default |
| Stack | Vite + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui; Biome; Vitest; Zod |
| Hosting | Static build on GitHub Pages: `https://esdedev.github.io/playlist2playlist/` |
| Repo | `esdedev/playlist2playlist`, public |
| Languages | English (default) + Spanish, typed string tables, no i18n library |
| Licence | AGPL-3.0 |
| Backend | None. No analytics, no third-party requests besides Spotify. |

## 4. Architecture

```
[source account] --reader--> Snapshot (JSON) --writer--> [destination account]
                                 |   ^
                         download|   |upload
                                 v   |
                            user's disk
```

One data model (the snapshot), one reader, one writer. The wizard only orchestrates.

### Modules (`src/`)

| File | Responsibility | Depends on |
|---|---|---|
| `lib/snapshot.ts` | Zod schema `SnapshotV1`, `parseSnapshot(json)`, `serializeSnapshot()` | zod |
| `lib/pkce.ts` | `createVerifier()`, `challengeFromVerifier()` (S256), `buildAuthorizeUrl()` | Web Crypto |
| `lib/auth.ts` | Per-role token store (memory + sessionStorage), code exchange, refresh, `getAccessToken(role)` | pkce, storage |
| `lib/spotify-api.ts` | `createClient(getToken, opts)` → `get/post/put`, `paginate()`, 429/5xx retry, abort | fetch |
| `lib/reader.ts` | `readLibrary(client, selection, onProgress)` → `Snapshot` | spotify-api, snapshot |
| `lib/writer.ts` | `writeLibrary(client, snapshot, selection, progressStore, onProgress)` → `Report` | spotify-api |
| `lib/report.ts` | `Report` type, counters, `skipped[]` entries | — |
| `lib/progress-store.ts` | Resumable progress (sessionStorage): playlist source id → destination id, items written | storage |
| `lib/chunk.ts` | `chunk(array, size)` | — |
| `i18n/{en,es}.ts`, `i18n/index.tsx` | String tables (es typed against en), `useT()`, language picker | React |
| `app/state.ts` | Wizard reducer + persisted step | — |
| `steps/*.tsx` | One component per wizard step | lib, ui |
| `components/ui/*` | shadcn components | — |

All `lib/` modules are pure TypeScript, testable without a browser except for `fetch`,
which is injected.

### Snapshot v1

```jsonc
{
  "version": 1,
  "exportedAt": "2026-10-22T18:00:00.000Z",
  "source": { "userId": "abc", "displayName": "Esteban" },
  "playlists": [
    { "id": "…", "name": "Running", "description": "", "public": false,
      "collaborative": false, "owned": true,
      "items": [ { "uri": "spotify:track:…", "addedAt": "…" } ] },
    { "id": "…", "name": "Lo-fi beats", "description": "", "public": true,
      "collaborative": false, "owned": false, "items": [] }
  ],
  "likedTracks":     [ { "uri": "spotify:track:…", "addedAt": "…" } ],
  "savedAlbums":     [ { "uri": "spotify:album:…", "addedAt": "…" } ],
  "followedArtists": [ { "uri": "spotify:artist:…" } ]
}
```

- Every entity is stored by **URI** because the write endpoints take URIs.
- `addedAt` is nullable (very old playlists return `null`).
- Local files are kept in the snapshot (`spotify:local:…`) so the JSON is a faithful backup;
  the writer skips them and reports them.
- Collaborative playlists not owned by the user count as **not owned** (followed).
- A file with an unknown `version` or invalid shape is rejected with a clear message.
- Description HTML entities from the API (`&amp;`, `&#x27;` …) are decoded once by the reader.

### Selection

```ts
type Selection = {
  ownedPlaylists: boolean; followedPlaylists: boolean;
  liked: boolean; albums: boolean; artists: boolean;
  excludedPlaylistIds: string[]   // individual playlists unticked by the user
}
```

The reader only reads what is selected; the writer only writes what is selected **and**
present in the snapshot.

## 5. Authentication

- Authorization Code with PKCE (S256), no client secret, plain `fetch` to
  `https://accounts.spotify.com/authorize` and `/api/token`.
- **Client ID**: the user's own one if they set it under Advanced (kept in `localStorage`;
  not a secret), else `import.meta.env.VITE_SPOTIFY_CLIENT_ID`. With neither, the setup
  screen is shown first.
- **Redirect URI**: `location.origin + location.pathname` (normalised to end in `/`), shown
  on screen with a copy button. Dev server runs on `http://127.0.0.1:5173/playlist2playlist/` (Vite `base`).
- **Roles**: `source` and `destination`. `state` = `<role>.<random nonce>`; the verifier and
  nonce live in `sessionStorage` under the role. The callback validates the nonce, exchanges
  the code, removes `code`/`state` from the URL with `history.replaceState`, and resumes the
  wizard.
- **Scopes**
  - source: `playlist-read-private playlist-read-collaborative user-library-read user-follow-read`
  - destination: `playlist-read-private playlist-modify-public playlist-modify-private
    user-library-read user-library-modify user-follow-read user-follow-modify`
    (read scopes are needed for idempotency checks).
- **Tokens**: memory + `sessionStorage` (survive the redirect round-trip, die with the tab).
  Never `localStorage`. Refreshed with the refresh token when < 5 minutes remain or after a
  401 (once). "Forget everything" clears both storages.
- **Two accounts in one browser**: always `show_dialog=true`, so Spotify shows the consent
  page with a *Not you?* link even when a session exists; the UI tells the user to use it.
  Fallback link to `https://accounts.spotify.com/logout` in a new tab. After the destination
  callback, `GET /me` is compared with the source id; if equal, the destination token is
  discarded and the step shows an error and retries.

## 6. Reader

Sequential, selection-driven:

1. `GET /me` → `source`.
2. If any playlist type is selected: paginate `GET /me/playlists`. `owned = owner.id === me.id`.
   Excluded ids are dropped.
3. For each owned playlist: paginate `GET /playlists/{id}/items?additional_types=track,episode
   &fields=items(added_at,is_local,item(uri,type)),next`. Entries with `item === null`
   (unavailable content) are skipped and counted as `unavailable` in the read summary.
4. Liked: paginate `GET /me/tracks`. Albums: paginate `GET /me/albums`.
   Artists: cursor-paginate `GET /me/following?type=artist&limit=50`.
5. Emit progress `{ phase, done, total }` after every page.

## 7. Writer

Sequential, idempotent, resumable. Order: owned playlists → followed playlists → liked →
albums → artists.

- **Owned playlists**: list the destination's own playlists once (`GET /me/playlists`,
  filter `owner.id === destination id`). For each source playlist:
  1. If the progress store already maps it to a destination id, reuse it and continue from
     the stored item count.
  2. Else if a destination-owned playlist has the exact same name → mark `alreadyExisted`,
     skip (never touch user data we did not create in this run).
  3. Else `POST /me/playlists` with name, description, public, collaborative (collaborative
     forces public=false), store the mapping.
  4. Add non-local items with `POST /playlists/{id}/items` in chunks of 100, in original
     order; after each chunk persist the written count. Local files → `skipped` with reason
     `local`.
- **Followed playlists, liked tracks, albums, artists** ("library items"): URIs in chunks of
  40 → `GET /me/library/contains` → `PUT /me/library` with only the missing ones. Liked
  tracks are sorted by `addedAt` ascending (nulls first) so the destination's Liked Songs
  end up newest-first like the source. Order inside one 40-URI request is not guaranteed by
  Spotify; this is documented.
- **Progress store** (`sessionStorage`, keyed by source user id + destination user id, so it
  survives re-reading the source after a reload): `playlists: { [sourcePlaylistId]: { destId,
  written } }`. The snapshot itself is not persisted (it can exceed the storage quota); after
  a reload the transfer re-reads the source, and the progress store plus the `contains`
  checks make the second pass skip everything already done. Library phases need no stored
  counter because `contains` is the source of truth.
- **Errors**: a 4xx on one chunk (other than 401/429) records every URI of that chunk as
  `skipped` with reason `api-error` and continues; 401 after refresh, network failure after
  retries, or abort stops the run and keeps progress. The report is always produced.

## 8. HTTP client

- `Authorization: Bearer` from `getToken()`; on 401 call `getToken({ forceRefresh: true })`
  once and retry.
- 429: wait `Retry-After` seconds (default 5) + 1 s; 5xx and network errors: exponential
  backoff 1 s, 2 s, 4 s, 8 s; max 5 attempts, then throw `SpotifyApiError(status, body)`.
- Concurrency 1. `AbortSignal` honoured in requests and waits.
- `sleep` and `fetch` are injectable for tests.

## 9. Report

```ts
type Report = {
  counts: Record<Phase, { created: number; added: number; alreadyThere: number; skipped: number }>
  skipped: { phase: Phase; playlist?: string; uri: string; reason: "local" | "api-error" | "unavailable" }[]
  finishedAt: string; aborted: boolean
}
```

Shown as a table, downloadable as JSON.

## 10. User interface

**Principle (owner, 2026-10-22): as simple as possible for the user.** The happy path is
*connect old → connect new → one button → done*. Everything else is optional and folded.

A single page (shadcn Card, Button, Checkbox, Progress, Alert, Input, Collapsible), state in
a `useReducer`, persisted in `sessionStorage` so the redirect round-trips are invisible.
Both tokens coexist (one per role), so both accounts are connected **before** anything is
read, and reading + writing run back to back on one progress screen.

| Step | Content |
|---|---|
| Setup (skipped when the build has a default Client ID; otherwise shown once, then remembered; always reachable from "Advanced: use your own Client ID") | Numbered guide with direct link to `https://developer.spotify.com/dashboard/create`, copy buttons for app name, description and the exact Redirect URI, "Web API" checkbox reminder, reminder to add both e-mails under *User Management*; Client ID input validated as 32 hex chars |
| 1 Old account | "Connect your old account" → shows name |
| 2 New account | One line: "On Spotify's screen click *Not you?* and log in with the new account" (the authorize page always shows it because of `show_dialog=true`); fallback link "Still logged in as the old one? Log out here" opening `accounts.spotify.com/logout`. Same-account check |
| 3 Transfer | Summary with counts fetched cheaply (`total` of the first page of each endpoint): "23 playlists, 7 followed, 1,842 liked songs, 96 albums, 310 artists". Big button **Transfer everything**. Folded "Customize" section with the five checkboxes and the per-playlist list. Pressing the button reads then writes with one progress bar per phase, Cancel, resume after reload |
| 4 Done | "All done" with counts, skipped items list (folded if empty), "Download report", "Download backup (JSON)", "Forget everything" |

**Export / import** (secondary, link in the footer of steps 1 and 3): "Only download a
backup" reads the old account and downloads the JSON without a new account; "Import a backup
file" uploads the JSON, connects only the new account and goes to step 3 with counts from the
file.

Header: product name, language picker (EN/ES, initial from `navigator.language`). Footer:
"Runs entirely in your browser. No server. Source on GitHub." Works at 390 px wide.

## 11. Testing

- Vitest, `happy-dom` environment only where needed.
- Unit tests with injected `fetch`: `pkce` (RFC 7636 test vector), `snapshot` (valid,
  invalid, unknown version), `chunk`, `spotify-api` (pagination, 429 with Retry-After, 5xx
  backoff, 401 refresh-once, abort), `reader` (ownership, local files, null items, exclusions,
  cursor pagination), `writer` (create + add in 100s, existing name skip, contains filter,
  liked order, resume from progress store, chunk error → skipped, local → skipped),
  `auth` (state validation, refresh timing).
- A fake Spotify server object in `src/test/fake-spotify.ts` that implements the endpoints
  above in memory, so reader → writer round-trips are tested end to end.
- Manual QA in the browser at 390 px and desktop, both languages. A real-account run needs
  the owner's Client ID and is listed as a manual step in the README.

## 12. Delivery

- `pnpm build` → `dist/` with `base: "/playlist2playlist/"`.
- GitHub Actions workflow: on push to `main`, install, lint, test, build (with the repository
  variable `VITE_SPOTIFY_CLIENT_ID`), deploy to Pages.
- One-time manual step for the owner (cannot be automated): create the Spotify app with
  Redirect URIs `https://esdedev.github.io/playlist2playlist/` and
  `http://127.0.0.1:5173/playlist2playlist/`, set the repository variable, add allowed accounts.
- README (EN + ES section): what it does, privacy, setup of the Spotify app with the exact
  Redirect URI, limits (5 users, Premium, covers, order inside batches), self-hosting.
- `LICENSE` AGPL-3.0, `.node-version` 24.
