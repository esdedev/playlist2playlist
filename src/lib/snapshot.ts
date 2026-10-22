import { z } from "zod"

/** Spotify ids are base62. Anything else (commas especially) could smuggle extra URIs into
 * the comma-separated `uris` query parameter, so it is rejected. */
// Regex literals on purpose: inside a template string "\s" silently becomes "s".
const spotifyId = z.string().regex(/^[0-9A-Za-z]+$/)
const URI_PATTERNS = {
  track: /^spotify:track:[0-9A-Za-z]+$/,
  album: /^spotify:album:[0-9A-Za-z]+$/,
  artist: /^spotify:artist:[0-9A-Za-z]+$/,
} as const
const spotifyUri = (kind: keyof typeof URI_PATTERNS) =>
  z.string().regex(URI_PATTERNS[kind], `expected a spotify:${kind}: URI`)

/** Local files keep Spotify's URL-encoded form; they are never sent back to the API. */
const itemUri = z.string().regex(/^(spotify:(track|episode):[0-9A-Za-z]+|spotify:local:[^\s,]+)$/)
const isoOrNull = z.string().nullable()

const PlaylistSchema = z.object({
  id: spotifyId,
  name: z.string(),
  description: z.string(),
  public: z.boolean(),
  collaborative: z.boolean(),
  /** true: the source user owns it → copy. false: someone else's → follow. */
  owned: z.boolean(),
  items: z.array(z.object({ uri: itemUri, addedAt: isoOrNull })),
})

export const SnapshotSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  source: z.object({ userId: z.string().min(1), displayName: z.string() }),
  playlists: z.array(PlaylistSchema),
  likedTracks: z.array(z.object({ uri: spotifyUri("track"), addedAt: isoOrNull })),
  savedAlbums: z.array(z.object({ uri: spotifyUri("album"), addedAt: isoOrNull })),
  followedArtists: z.array(z.object({ uri: spotifyUri("artist") })),
})

export type Snapshot = z.infer<typeof SnapshotSchema>
export type SnapshotPlaylist = Snapshot["playlists"][number]
export type PlaylistItem = SnapshotPlaylist["items"][number]

export type ParseResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; reason: "not-json" | "unsupported-version" | "invalid" }

export function parseSnapshot(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: "not-json" }
  }
  if (typeof raw === "object" && raw !== null && "version" in raw && raw.version !== 1) {
    return { ok: false, reason: "unsupported-version" }
  }
  const parsed = SnapshotSchema.safeParse(raw)
  return parsed.success ? { ok: true, snapshot: parsed.data } : { ok: false, reason: "invalid" }
}

export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

/** What the user chose to transfer. */
export type Selection = {
  ownedPlaylists: boolean
  followedPlaylists: boolean
  liked: boolean
  albums: boolean
  artists: boolean
  excludedPlaylistIds: string[]
}

export const ALL_SELECTED: Selection = {
  ownedPlaylists: true,
  followedPlaylists: true,
  liked: true,
  albums: true,
  artists: true,
  excludedPlaylistIds: [],
}
