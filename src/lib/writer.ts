import { chunk } from "./chunk"
import type { ProgressStore } from "./progress-store"
import { getMe, listPlaylists } from "./reader"
import { emptyReport, type OnProgress, type Phase, type Report, type SkipReason } from "./report"
import type { Selection, Snapshot, SnapshotPlaylist } from "./snapshot"
import { SpotifyApiError, type SpotifyClient } from "./spotify-api"

const PLAYLIST_ADD_LIMIT = 100
const LIBRARY_LIMIT = 40

export type WriteOptions = {
  client: SpotifyClient
  snapshot: Snapshot
  selection: Selection
  progress: ProgressStore
  onProgress?: OnProgress
}

/** A failure that affects only the current chunk; the run continues. */
function isChunkError(err: unknown): boolean {
  return (
    err instanceof SpotifyApiError &&
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
 * Writes a snapshot into the connected (destination) account. Idempotent: anything already
 * present is counted as `alreadyThere` and not written again. Never deletes or modifies
 * content it did not create. Always resolves with a report, even when aborted or failing.
 */
export async function writeLibrary(opts: WriteOptions): Promise<Report> {
  const { client, snapshot, selection, progress } = opts
  const onProgress = opts.onProgress ?? (() => {})
  const report = emptyReport()
  const emit = (phase: Phase, done: number, total: number, label?: string) =>
    onProgress({ stage: "write", phase, done, total, ...(label === undefined ? {} : { label }) })
  const skip = (phase: Phase, uri: string, reason: SkipReason, playlist?: string) => {
    report.skipped.push({ phase, uri, reason, ...(playlist === undefined ? {} : { playlist }) })
    report.counts[phase].skipped++
  }

  const excluded = new Set(selection.excludedPlaylistIds)
  const playlists = snapshot.playlists.filter((p) => !excluded.has(p.id))

  async function copyOwnedPlaylists(owned: SnapshotPlaylist[]) {
    const counts = report.counts.ownedPlaylists
    const me = await getMe(client)
    const existingNames = new Set(
      (await listPlaylists(client)).filter((p) => p.owner.id === me.id).map((p) => p.name),
    )
    const total = owned.reduce((sum, p) => sum + p.items.length, 0)
    let done = 0
    emit("ownedPlaylists", 0, total)

    for (const playlist of owned) {
      const addable = playlist.items.filter((i) => !isLocal(i.uri)).map((i) => i.uri)
      for (const item of playlist.items)
        if (isLocal(item.uri)) skip("ownedPlaylists", item.uri, "local", playlist.name)

      let state = progress.get(playlist.id)
      if (state && state.written >= addable.length) {
        counts.alreadyThere++
        done += playlist.items.length
        emit("ownedPlaylists", done, total, playlist.name)
        continue
      }
      if (!state) {
        if (existingNames.has(playlist.name)) {
          counts.alreadyThere++
          done += playlist.items.length
          emit("ownedPlaylists", done, total, playlist.name)
          continue
        }
        try {
          const created = await client.post<{ id: string }>("/me/playlists", {
            name: playlist.name,
            description: playlist.description,
            public: playlist.collaborative ? false : playlist.public,
            collaborative: playlist.collaborative,
          })
          state = { destId: created.id, written: 0 }
          progress.set(playlist.id, state)
          counts.created++
        } catch (err) {
          if (!isChunkError(err)) throw err
          skip("ownedPlaylists", `spotify:playlist:${playlist.id}`, "api-error", playlist.name)
          done += playlist.items.length
          emit("ownedPlaylists", done, total, playlist.name)
          continue
        }
      }

      done += playlist.items.length - addable.length + state.written
      const remaining = addable.slice(state.written)
      for (const group of chunk(remaining, PLAYLIST_ADD_LIMIT)) {
        try {
          await client.post(`/playlists/${state.destId}/items`, { uris: group })
          counts.added += group.length
        } catch (err) {
          if (!isChunkError(err)) throw err
          for (const uri of group) skip("ownedPlaylists", uri, "api-error", playlist.name)
        }
        state = { ...state, written: state.written + group.length }
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
      try {
        const present = await client.get<boolean[]>("/me/library/contains", {
          uris: group.join(","),
        })
        const missing = group.filter((_, i) => !present[i])
        counts.alreadyThere += group.length - missing.length
        if (missing.length > 0) {
          await client.put("/me/library", undefined, { uris: missing.join(",") })
          counts.added += missing.length
        }
      } catch (err) {
        if (!isChunkError(err)) throw err
        for (const uri of group) skip(phase, uri, "api-error")
      }
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
    if (!isAbort(err)) report.error = err instanceof Error ? err.message : String(err)
  }
  report.finishedAt = new Date().toISOString()
  return report
}
