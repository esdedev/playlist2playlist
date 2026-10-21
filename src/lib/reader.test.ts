import { beforeEach, describe, expect, test } from "vitest"
import { FakeSpotify } from "@/test/fake-spotify"
import { readCounts, readLibrary } from "./reader"
import type { Progress } from "./report"
import { ALL_SELECTED } from "./snapshot"
import { createClient } from "./spotify-api"

let fake: FakeSpotify

function clientFor(userId: string) {
  return createClient({
    fetch: fake.fetch,
    getToken: async () => `token-${userId}`,
    sleep: async () => {},
  })
}

beforeEach(() => {
  fake = new FakeSpotify()
  fake.addUser("old", "Old me")
  fake.addUser("friend")
})

describe("readLibrary", () => {
  test("splits owned and followed playlists and copies items in order", async () => {
    fake.addPlaylist("old", {
      id: "mine",
      name: "Running",
      description: "Rock &amp; roll",
      public: false,
      items: [
        { uri: "spotify:track:1", addedAt: "2020-01-01T00:00:00Z" },
        { uri: "spotify:episode:2", addedAt: null },
      ],
    })
    fake.addPlaylist(
      "friend",
      { id: "theirs", name: "Lo-fi", items: [{ uri: "spotify:track:9", addedAt: null }] },
      ["old"],
    )
    const { snapshot } = await readLibrary(clientFor("old"), ALL_SELECTED)
    expect(snapshot.source).toEqual({ userId: "old", displayName: "Old me" })
    expect(snapshot.playlists).toEqual([
      {
        id: "mine",
        name: "Running",
        description: "Rock & roll",
        public: false,
        collaborative: false,
        owned: true,
        items: [
          { uri: "spotify:track:1", addedAt: "2020-01-01T00:00:00Z" },
          { uri: "spotify:episode:2", addedAt: null },
        ],
      },
      {
        id: "theirs",
        name: "Lo-fi",
        description: "",
        public: true,
        collaborative: false,
        owned: false,
        items: [],
      },
    ])
    expect(fake.log).not.toContain("GET /playlists/theirs/items")
  })

  test("a collaborative playlist owned by someone else counts as followed", async () => {
    fake.addPlaylist(
      "friend",
      { id: "collab", name: "Party", collaborative: true, public: false },
      ["old"],
    )
    const { snapshot } = await readLibrary(clientFor("old"), ALL_SELECTED)
    expect(snapshot.playlists[0]?.owned).toBe(false)
  })

  test("keeps local files, drops unavailable items and counts them", async () => {
    fake.addPlaylist("old", {
      id: "mine",
      name: "Mix",
      items: [
        { uri: "spotify:local:Artist:Album:Song:180", addedAt: null, isLocal: true },
        { uri: "spotify:track:gone", addedAt: null, unavailable: true },
        { uri: "spotify:track:ok", addedAt: null },
      ],
    })
    const { snapshot, unavailable } = await readLibrary(clientFor("old"), ALL_SELECTED)
    expect(snapshot.playlists[0]?.items.map((i) => i.uri)).toEqual([
      "spotify:local:Artist:Album:Song:180",
      "spotify:track:ok",
    ])
    expect(unavailable).toBe(1)
  })

  test("paginates beyond one page everywhere", async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      uri: `spotify:track:p${i}`,
      addedAt: null,
    }))
    fake.addPlaylist("old", { id: "big", name: "Big", items })
    const user = fake.users.get("old")
    if (!user) throw new Error("missing user")
    for (let i = 0; i < 75; i++)
      user.liked.push({
        uri: `spotify:track:l${i}`,
        addedAt: `2020-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
      })
    for (let i = 0; i < 55; i++)
      user.albums.push({ uri: `spotify:album:a${i}`, addedAt: "2021-01-01T00:00:00Z" })
    for (let i = 0; i < 101; i++) user.artists.push(`spotify:artist:r${i}`)
    for (let i = 0; i < 60; i++) fake.addPlaylist("friend", { name: `f${i}` }, ["old"])

    const { snapshot } = await readLibrary(clientFor("old"), ALL_SELECTED)
    expect(snapshot.playlists).toHaveLength(61)
    expect(snapshot.playlists[0]?.items).toHaveLength(120)
    expect(snapshot.likedTracks).toHaveLength(75)
    expect(snapshot.likedTracks[0]?.uri).toBe("spotify:track:l74")
    expect(snapshot.savedAlbums).toHaveLength(55)
    expect(snapshot.followedArtists).toHaveLength(101)
    expect(new Set(snapshot.followedArtists.map((a) => a.uri)).size).toBe(101)
  })

  test("reads nothing that was not selected and honours exclusions", async () => {
    fake.addPlaylist("old", { id: "keep", name: "Keep" })
    fake.addPlaylist("old", { id: "skip", name: "Skip" })
    const { snapshot } = await readLibrary(clientFor("old"), {
      ownedPlaylists: true,
      followedPlaylists: false,
      liked: false,
      albums: false,
      artists: false,
      excludedPlaylistIds: ["skip"],
    })
    expect(snapshot.playlists.map((p) => p.id)).toEqual(["keep"])
    expect(fake.log.filter((l) => /tracks|albums|following/.test(l))).toEqual([])
    expect(fake.log).not.toContain("GET /playlists/skip/items")
  })

  test("reports progress per phase ending at the total", async () => {
    const user = fake.users.get("old")
    user?.liked.push({ uri: "spotify:track:x", addedAt: "2020-01-01T00:00:00Z" })
    const events: Progress[] = []
    await readLibrary(clientFor("old"), ALL_SELECTED, (p) => events.push(p))
    const liked = events.filter((e) => e.phase === "liked")
    expect(liked.at(-1)).toEqual({ stage: "read", phase: "liked", done: 1, total: 1 })
  })
})

describe("readCounts", () => {
  test("counts each category and lists playlists", async () => {
    fake.addPlaylist("old", {
      id: "mine",
      name: "Mine",
      items: [{ uri: "spotify:track:1", addedAt: null }],
    })
    fake.addPlaylist("friend", { id: "theirs", name: "Theirs" }, ["old"])
    fake.users.get("old")?.artists.push("spotify:artist:a")
    const counts = await readCounts(clientFor("old"))
    expect(counts).toEqual({
      me: { id: "old", displayName: "Old me" },
      ownedPlaylists: 1,
      followedPlaylists: 1,
      liked: 0,
      albums: 0,
      artists: 1,
      playlists: [
        { id: "mine", name: "Mine", owned: true, itemCount: 1 },
        { id: "theirs", name: "Theirs", owned: false, itemCount: 0 },
      ],
    })
  })
})
