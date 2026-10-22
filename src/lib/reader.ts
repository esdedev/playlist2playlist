import { decodeEntities } from "./html"
import type { OnProgress, Phase } from "./report"
import type { PlaylistItem, Selection, Snapshot, SnapshotPlaylist } from "./snapshot"
import type { SpotifyClient } from "./spotify-api"

type ApiUser = { id: string; display_name: string | null }
export type ApiPlaylist = {
  id: string
  name: string
  description: string | null
  public: boolean | null
  collaborative: boolean
  owner: { id: string }
  items?: { total: number }
  /** Deprecated name of `items`; still read as a fallback. */
  tracks?: { total: number }
}
type ApiPlaylistEntry = { added_at: string | null; is_local: boolean; item: { uri: string } | null }
type ApiSaved<K extends string> = { added_at: string } & Record<K, { uri: string } | null>

export type Me = { id: string; displayName: string }

export async function getMe(client: SpotifyClient): Promise<Me> {
  const me = await client.get<ApiUser>("/me")
  return { id: me.id, displayName: me.display_name ?? me.id }
}

export async function listPlaylists(client: SpotifyClient): Promise<ApiPlaylist[]> {
  const all: ApiPlaylist[] = []
  for await (const page of client.paginate<ApiPlaylist | null>("/me/playlists", { limit: 50 })) {
    for (const p of page.items) if (p) all.push(p)
  }
  return all
}

const itemTotal = (p: ApiPlaylist) => p.items?.total ?? p.tracks?.total ?? 0

export type Counts = {
  me: Me
  ownedPlaylists: number
  followedPlaylists: number
  liked: number
  albums: number
  artists: number
  playlists: { id: string; name: string; owned: boolean; itemCount: number }[]
}

/** Cheap overview for the "Transfer everything" screen: one page per category. */
export async function readCounts(client: SpotifyClient): Promise<Counts> {
  const me = await getMe(client)
  const playlists = (await listPlaylists(client)).map((p) => ({
    id: p.id,
    name: p.name,
    owned: p.owner.id === me.id,
    itemCount: itemTotal(p),
  }))
  const total = async (path: string, query: Record<string, string | number>, key?: string) => {
    for await (const page of client.paginate(path, { ...query, limit: 1 }, key)) return page.total
    return 0
  }
  return {
    me,
    ownedPlaylists: playlists.filter((p) => p.owned).length,
    followedPlaylists: playlists.filter((p) => !p.owned).length,
    liked: await total("/me/tracks", {}),
    albums: await total("/me/albums", {}),
    artists: await total("/me/following", { type: "artist" }, "artists"),
    playlists,
  }
}

export type ReadResult = { snapshot: Snapshot; unavailable: number }

/** Reads the selected parts of the connected account into a snapshot. */
export async function readLibrary(
  client: SpotifyClient,
  selection: Selection,
  onProgress: OnProgress = () => {},
): Promise<ReadResult> {
  const me = await getMe(client)
  const emit = (phase: Phase, done: number, total: number, label?: string) =>
    onProgress({ stage: "read", phase, done, total, ...(label === undefined ? {} : { label }) })

  const playlists: SnapshotPlaylist[] = []
  let unavailable = 0

  if (selection.ownedPlaylists || selection.followedPlaylists) {
    const excluded = new Set(selection.excludedPlaylistIds)
    const listed = (await listPlaylists(client)).filter((p) => !excluded.has(p.id))
    const owned = listed.filter((p) => p.owner.id === me.id)
    const followed = listed.filter((p) => p.owner.id !== me.id)
    const toSnapshot = (
      p: ApiPlaylist,
      isOwned: boolean,
      items: PlaylistItem[],
    ): SnapshotPlaylist => ({
      id: p.id,
      name: p.name,
      description: decodeEntities(p.description ?? ""),
      public: p.public ?? false,
      collaborative: p.collaborative,
      owned: isOwned,
      items,
    })

    if (selection.ownedPlaylists) {
      const total = owned.reduce((sum, p) => sum + itemTotal(p), 0)
      let done = 0
      emit("ownedPlaylists", 0, total)
      for (const p of owned) {
        const items: PlaylistItem[] = []
        const query = {
          limit: 50,
          additional_types: "track,episode",
          fields: "items(added_at,is_local,item(uri,type)),next,total",
        }
        for await (const page of client.paginate<ApiPlaylistEntry>(
          `/playlists/${p.id}/items`,
          query,
        )) {
          for (const entry of page.items) {
            if (entry.item?.uri) items.push({ uri: entry.item.uri, addedAt: entry.added_at })
            else unavailable++
          }
          done += page.items.length
          emit("ownedPlaylists", Math.min(done, total), total, p.name)
        }
        playlists.push(toSnapshot(p, true, items))
      }
    }
    if (selection.followedPlaylists) {
      for (const p of followed) playlists.push(toSnapshot(p, false, []))
      emit("followedPlaylists", followed.length, followed.length)
    }
    // Keep the library order the user sees in Spotify.
    const order = new Map(listed.map((p, i) => [p.id, i]))
    playlists.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }

  async function readSaved<K extends "track" | "album">(phase: Phase, path: string, key: K) {
    const out: { uri: string; addedAt: string | null }[] = []
    for await (const page of client.paginate<ApiSaved<K>>(path, { limit: 50 })) {
      for (const entry of page.items) {
        const saved = entry?.[key]
        if (saved?.uri) out.push({ uri: saved.uri, addedAt: entry.added_at })
        else unavailable++
      }
      emit(phase, out.length, page.total)
    }
    if (out.length === 0) emit(phase, 0, 0)
    return out
  }

  const likedTracks = selection.liked ? await readSaved("liked", "/me/tracks", "track") : []
  const savedAlbums = selection.albums ? await readSaved("albums", "/me/albums", "album") : []

  const followedArtists: { uri: string }[] = []
  if (selection.artists) {
    for await (const page of client.paginate<{ uri: string }>(
      "/me/following",
      { type: "artist", limit: 50 },
      "artists",
    )) {
      for (const artist of page.items) followedArtists.push({ uri: artist.uri })
      emit("artists", followedArtists.length, page.total)
    }
    if (followedArtists.length === 0) emit("artists", 0, 0)
  }

  return {
    snapshot: {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: { userId: me.id, displayName: me.displayName },
      playlists,
      likedTracks,
      savedAlbums,
      followedArtists,
    },
    unavailable,
  }
}
