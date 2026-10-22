import { describe, expect, test } from "vitest"
import { parseSnapshot, type Snapshot, serializeSnapshot } from "./snapshot"

const valid: Snapshot = {
  version: 1,
  exportedAt: "2026-10-22T18:00:00.000Z",
  source: { userId: "old", displayName: "Old me" },
  playlists: [
    {
      id: "37i9dQZF1DXcBWIGoYBM5M",
      name: "Running",
      description: "",
      public: false,
      collaborative: false,
      owned: true,
      items: [
        { uri: "spotify:track:5sICkBXVmaCQk5aISGR3x1", addedAt: "2020-01-01T00:00:00Z" },
        { uri: "spotify:local:The+Artist:Some+Album:Song%2C+live:180", addedAt: null },
      ],
    },
  ],
  likedTracks: [{ uri: "spotify:track:3n3Ppam7vgaVa1iaRUc9Lp", addedAt: "2021-01-01T00:00:00Z" }],
  savedAlbums: [{ uri: "spotify:album:4aawyAB9vmqN3uQ7FjRGTy", addedAt: "2022-01-01T00:00:00Z" }],
  followedArtists: [{ uri: "spotify:artist:0OdUWJ0sBjDrqHygGUXeCF" }],
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
  test("accepts real ids containing any base62 character", () => {
    const ids = ["5sICkBXVmaCQk5aISGR3x1", "ssssssssssssssssssssss", "0123456789ABCDEFGHIJKa"]
    for (const id of ids) {
      const result = parseSnapshot(
        JSON.stringify({ ...valid, likedTracks: [{ uri: `spotify:track:${id}`, addedAt: null }] }),
      )
      expect(result.ok).toBe(true)
    }
  })
  test("rejects ids that could inject extra URIs into a comma-separated query", () => {
    const injected = parseSnapshot(
      JSON.stringify({
        ...valid,
        followedArtists: [{ uri: "spotify:artist:abc,spotify:track:x" }],
      }),
    )
    expect(injected).toEqual({ ok: false, reason: "invalid" })
    const badPlaylistId = parseSnapshot(
      JSON.stringify({
        ...valid,
        playlists: [{ ...valid.playlists[0], id: "x,spotify:track:y" }],
      }),
    )
    expect(badPlaylistId).toEqual({ ok: false, reason: "invalid" })
  })
  test("rejects a URI that is not a spotify URI", () => {
    const result = parseSnapshot(
      JSON.stringify({ ...valid, likedTracks: [{ uri: "https://evil", addedAt: null }] }),
    )
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })
})
