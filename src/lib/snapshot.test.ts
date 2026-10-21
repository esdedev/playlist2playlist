import { describe, expect, test } from "vitest"
import { parseSnapshot, type Snapshot, serializeSnapshot } from "./snapshot"

const valid: Snapshot = {
  version: 1,
  exportedAt: "2026-10-22T18:00:00.000Z",
  source: { userId: "old", displayName: "Old me" },
  playlists: [
    {
      id: "p1",
      name: "Running",
      description: "",
      public: false,
      collaborative: false,
      owned: true,
      items: [
        { uri: "spotify:track:a", addedAt: "2020-01-01T00:00:00Z" },
        { uri: "spotify:local:x:y:z:1", addedAt: null },
      ],
    },
  ],
  likedTracks: [{ uri: "spotify:track:b", addedAt: "2021-01-01T00:00:00Z" }],
  savedAlbums: [{ uri: "spotify:album:c", addedAt: "2022-01-01T00:00:00Z" }],
  followedArtists: [{ uri: "spotify:artist:d" }],
}

describe("snapshot", () => {
  test("round-trips through serialize and parse", () => {
    const result = parseSnapshot(serializeSnapshot(valid))
    expect(result).toEqual({ ok: true, snapshot: valid })
  })
  test("rejects an unknown version with a clear reason", () => {
    const result = parseSnapshot(JSON.stringify({ ...valid, version: 2 }))
    expect(result).toEqual({ ok: false, reason: "unsupported-version" })
  })
  test("rejects malformed JSON", () => {
    expect(parseSnapshot("{nope")).toEqual({ ok: false, reason: "not-json" })
  })
  test("rejects a wrong shape", () => {
    const result = parseSnapshot(JSON.stringify({ ...valid, likedTracks: [{ uri: 3 }] }))
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })
  test("rejects a URI that is not a spotify URI", () => {
    const result = parseSnapshot(
      JSON.stringify({ ...valid, likedTracks: [{ uri: "https://evil", addedAt: null }] }),
    )
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })
})
