import { AuthError } from "./auth"
import { chunk } from "./chunk"
import type { PlaylistProgress, ProgressStore } from "./progress-store"
import { getMe, listPlaylists } from "./reader"
import { emptyReport, type OnProgress, type Phase, type Report, type SkipReason } from "./report"
import type { Selection, Snapshot, SnapshotPlaylist } from "./snapshot"
import { abortError, RateLimitedError, SpotifyApiError, type SpotifyClient } from "./spotify-api"

const PLAYLIST_ADD_LIMIT = 100
const LIBRARY_LIMIT = 40

export type WriteOptions = {
  client: SpotifyClient
  snapshot: Snapshot
  selection: Selection
  progress: ProgressStore
  onProgress?: OnProgress
  /**
   * Cooperative stop, checked between requests. Never pass the same signal to the client:
   * aborting a write mid-request leaves Spotify's state unknown.
   */
  stop?: AbortSignal
}

/** A refusal that concerns only the URIs in this request; the run continues. */
function isChunkError(err: unknown): boolean {
  return (
    err instanceof SpotifyApiError &&
    !err.uncertain &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 401 &&
    err.status !== 429
  )
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError"
}

const isLocal = (uri: string) => uri.startsWith("spotify:local:")

/** Oldest first, undated first: saving in this order leaves the newest on top. */
function byAddedAtAscending(a: { addedAt: string | null }, b: { addedAt: string | null }): number {
  if (a.addedAt === b.addedAt) return 0
  if (a.addedAt === null) return -1
  if (b.addedAt === null) return 1
  return a.addedAt < b.addedAt ? -1 : 1
}

/**
 * Sends `uris` with `send`; when Spotify refuses the request, splits it in halves until the
 * offending URIs are isolated, so one bad item never takes its whole batch down.
 */
async function sendBisecting<T>(
  uris: string[],
  send: (group: string[]) => Promise<T>,
  onResult: (result: T) => void,
  onRejected: (uri: string) => void,
): Promise<void> {
  try {
    onResult(await send(uris))
  } catch (err) {
    if (!isChunkError(err)) throw err
    if (uris.length === 1) {
      onRejected(uris[0] as string)
      return
    }
    const mid = Math.ceil(uris.length / 2)
    await sendBisecting(uris.slice(0, mid), send, onResult, onRejected)
    await sendBisecting(uris.slice(mid), send, onResult, onRejected)
  }
}

/**
 * Writes a snapshot into the connected (destination) account. Idempotent: anything already
 * present is counted as `alreadyThere` and not written again. Never deletes or modifies
 * content it did not create. Always resolves with a report, even when stopped or failing.
 */
export async function writeLibrary(opts: WriteOptions): Promise<Report> {
  const { client, snapshot, selection, progress, stop } = opts
  const onProgress = opts.onProgress ?? (() => {})
  const report = emptyReport()
  const emit = (phase: Phase, done: number, total: number, label?: string) =>
    onProgress({ stage: "write", phase, done, total, ...(label === undefined ? {} : { label }) })
  const skip = (phase: Phase, uri: string, reason: SkipReason, playlist?: string) => {
    report.skipped.push({ phase, uri, reason, ...(playlist === undefined ? {} : { playlist }) })
    report.counts[phase].skipped++
  }
  const checkStop = () => {
    if (stop?.aborted) throw abortError()
  }

  const excluded = new Set(selection.excludedPlaylistIds)
  const playlists = snapshot.playlists.filter((p) => !excluded.has(p.id))

  async function createPlaylist(playlist: SnapshotPlaylist): Promise<string> {
    const body = {
      name: playlist.name,
      description: playlist.description,
      public: playlist.collaborative ? false : playlist.public,
      collaborative: playlist.collaborative,
    }
    try {
      return (await client.post<{ id: string }>("/me/playlists", body)).id
    } catch (err) {
      // Spotify is picky about descriptions (length, characters); the playlist matters more.
      if (!isChunkError(err) || !playlist.description) throw err
      return (await client.post<{ id: string }>("/me/playlists", { ...body, description: "" })).id
    }
  }

  /** How many items the destination playlist really has: the truth after a lost answer. */
  async function destinationTotal(destId: string): Promise<number> {
    const page = await client.get<{ total: number }>(`/playlists/${destId}/items`, {
      limit: 1,
      fields: "total",
    })
    return page.total
  }

  async function copyOwnedPlaylists(owned: SnapshotPlaylist[]) {
    const counts = report.counts.ownedPlaylists
    const me = await getMe(client)
    const destinationOwned = (await listPlaylists(client)).filter((p) => p.owner.id === me.id)
    const existingIds = new Set(destinationOwned.map((p) => p.id))
    const mappedIds = new Set(
      Object.values(progress.all())
        .map((p) => p.destId)
        .filter((id): id is string => id !== null),
    )
    const total = owned.reduce((sum, p) => sum + p.items.length, 0)
    let done = 0
    emit("ownedPlaylists", 0, total)

    for (const playlist of owned) {
      checkStop()
      const addable = playlist.items.filter((i) => !isLocal(i.uri)).map((i) => i.uri)
      for (const item of playlist.items) {
        if (isLocal(item.uri)) skip("ownedPlaylists", item.uri, "local", playlist.name)
      }
      const localCount = playlist.items.length - addable.length
      const finish = () => {
        done += playlist.items.length
        emit("ownedPlaylists", done, total, playlist.name)
      }

      let state: PlaylistProgress | undefined = progress.get(playlist.id)
      let createdNow = false
      // The user deleted our copy since the last run: copy again.
      if (state?.destId && !existingIds.has(state.destId)) state = undefined
      // Last run sent the create request but never heard back: adopt what it created.
      const createWasInFlight = state?.destId === null
      if (createWasInFlight) {
        const adopted = destinationOwned.find(
          (p) => p.name === playlist.name && !mappedIds.has(p.id),
        )
        state = adopted ? { destId: adopted.id, written: 0, rejected: 0 } : undefined
        if (adopted) mappedIds.add(adopted.id)
      }

      if (!state) {
        if (!createWasInFlight && destinationOwned.some((p) => p.name === playlist.name)) {
          // Not ours (or from a run whose progress is gone): never touch it.
          counts.alreadyThere++
          finish()
          continue
        }
        progress.set(playlist.id, { destId: null, written: 0 })
        let destId: string
        try {
          destId = await createPlaylist(playlist)
        } catch (err) {
          if (!isChunkError(err)) throw err
          progress.delete(playlist.id)
          skip("ownedPlaylists", `spotify:playlist:${playlist.id}`, "api-error", playlist.name)
          for (const uri of addable) skip("ownedPlaylists", uri, "api-error", playlist.name)
          finish()
          continue
        }
        state = { destId, written: 0, rejected: 0 }
        progress.set(playlist.id, state)
        mappedIds.add(destId)
        counts.created++
        createdNow = true
      } else if (state.written < addable.length && state.destId) {
        // Resuming: trust Spotify's count, not ours (an answer may have been lost).
        const rejected = state.rejected ?? 0
        state = {
          ...state,
          written: Math.min((await destinationTotal(state.destId)) + rejected, addable.length),
        }
        progress.set(playlist.id, state)
      }

      const destId = state.destId as string
      if (state.written >= addable.length) {
        if (!createdNow) counts.alreadyThere++
        finish()
        continue
      }

      done += localCount + state.written
      emit("ownedPlaylists", done, total, playlist.name)
      for (const group of chunk(addable.slice(state.written), PLAYLIST_ADD_LIMIT)) {
        checkStop()
        let rejectedHere = 0
        await sendBisecting(
          group,
          (uris) => client.post(`/playlists/${destId}/items`, { uris }),
          () => {},
          (uri) => {
            rejectedHere++
            skip("ownedPlaylists", uri, "api-error", playlist.name)
          },
        )
        counts.added += group.length - rejectedHere
        state = {
          destId,
          written: state.written + group.length,
          rejected: (state.rejected ?? 0) + rejectedHere,
        }
        progress.set(playlist.id, state)
        done += group.length
        emit("ownedPlaylists", done, total, playlist.name)
      }
    }
  }

  async function saveToLibrary(phase: Phase, uris: string[]) {
    const counts = report.counts[phase]
    let done = 0
    emit(phase, 0, uris.length)
    for (const group of chunk(uris, LIBRARY_LIMIT)) {
      checkStop()
      await sendBisecting(
        group,
        async (part) => {
          const present = await client.get<boolean[]>("/me/library/contains", {
            uris: part.join(","),
          })
          const missing = part.filter((_, i) => !present[i])
          if (missing.length > 0)
            await client.put("/me/library", undefined, { uris: missing.join(",") })
          return { already: part.length - missing.length, added: missing.length }
        },
        (r) => {
          counts.alreadyThere += r.already
          counts.added += r.added
        },
        (uri) => skip(phase, uri, "api-error"),
      )
      done += group.length
      emit(phase, done, uris.length)
    }
  }

  try {
    if (selection.ownedPlaylists) await copyOwnedPlaylists(playlists.filter((p) => p.owned))
    if (selection.followedPlaylists) {
      await saveToLibrary(
        "followedPlaylists",
        playlists.filter((p) => !p.owned).map((p) => `spotify:playlist:${p.id}`),
      )
    }
    if (selection.liked) {
      await saveToLibrary(
        "liked",
        [...snapshot.likedTracks].sort(byAddedAtAscending).map((t) => t.uri),
      )
    }
    if (selection.albums) {
      await saveToLibrary(
        "albums",
        [...snapshot.savedAlbums].sort(byAddedAtAscending).map((a) => a.uri),
      )
    }
    if (selection.artists)
      await saveToLibrary(
        "artists",
        snapshot.followedArtists.map((a) => a.uri),
      )
  } catch (err) {
    report.aborted = true
    if (!isAbort(err)) {
      report.error = err instanceof Error ? err.message : String(err)
      if (err instanceof RateLimitedError) {
        report.errorKind = "rate-limit"
        report.retryAfterSeconds = err.retryAfterSeconds
      } else if (
        err instanceof AuthError ||
        (err instanceof SpotifyApiError && err.status === 401)
      ) {
        report.errorKind = "auth"
      } else {
        report.errorKind = "other"
      }
    }
  }
  report.finishedAt = new Date().toISOString()
  return report
}
