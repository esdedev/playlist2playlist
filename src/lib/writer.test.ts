import { beforeEach, describe, expect, test } from "vitest"
import { FakeSpotify } from "@/test/fake-spotify"
import { memoryProgressStore } from "./progress-store"
import { readLibrary } from "./reader"
import type { Progress } from "./report"
import { ALL_SELECTED, type Snapshot } from "./snapshot"
import { createClient } from "./spotify-api"
import { writeLibrary } from "./writer"

let fake: FakeSpotify

function clientFor(userId: string, signal?: AbortSignal) {
  return createClient({
    fetch: fake.fetch,
    getToken: async () => `token-${userId}`,
    sleep: async () => {},
    ...(signal ? { signal } : {}),
  })
}

function snapshot(partial: Partial<Snapshot>): Snapshot {
  return {
    version: 1,
    exportedAt: "2026-10-22T00:00:00.000Z",
    source: { userId: "old", displayName: "Old" },
    playlists: [],
    likedTracks: [],
    savedAlbums: [],
    followedArtists: [],
    ...partial,
  }
}

const tracks = (n: number, prefix = "t") =>
  Array.from({ length: n }, (_, i) => ({ uri: `spotify:track:${prefix}${i}`, addedAt: null }))

beforeEach(() => {
  fake = new FakeSpotify()
  fake.addUser("old")
  fake.addUser("new")
  fake.addUser("friend")
})

describe("writeLibrary", () => {
  test("creates owned playlists with their fields and adds items in order, in chunks of 100", async () => {
    const snap = snapshot({
      playlists: [
        {
          id: "src1",
          name: "Running",
          description: "Fast",
          public: false,
          collaborative: false,
          owned: true,
          items: tracks(250),
        },
      ],
    })
    const report = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })
    const created = [...fake.playlists.values()].find((p) => p.ownerId === "new")
    expect(created).toMatchObject({
      name: "Running",
      description: "Fast",
      public: false,
      collaborative: false,
    })
    expect(created?.items.map((i) => i.uri)).toEqual(tracks(250).map((t) => t.uri))
    expect(fake.log.filter((l) => l.startsWith("POST /playlists/"))).toHaveLength(3)
    expect(report.counts.ownedPlaylists).toEqual({
      created: 1,
      added: 250,
      alreadyThere: 0,
      skipped: 0,
    })
    expect(report.aborted).toBe(false)
  })

  test("collaborative playlists are created private", async () => {
    const snap = snapshot({
      playlists: [
        {
          id: "c",
          name: "Collab",
          description: "",
          public: true,
          collaborative: true,
          owned: true,
          items: [],
        },
      ],
    })
    await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })
    expect([...fake.playlists.values()].find((p) => p.ownerId === "new")).toMatchObject({
      collaborative: true,
      public: false,
    })
  })

  test("local files are skipped and reported with their playlist", async () => {
    const snap = snapshot({
      playlists: [
        {
          id: "src1",
          name: "Mix",
          description: "",
          public: true,
          collaborative: false,
          owned: true,
          items: [
            { uri: "spotify:track:a", addedAt: null },
            { uri: "spotify:local:Artist:Album:Song:180", addedAt: null },
          ],
        },
      ],
    })
    const report = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })
    expect(report.skipped).toEqual([
      {
        phase: "ownedPlaylists",
        playlist: "Mix",
        uri: "spotify:local:Artist:Album:Song:180",
        reason: "local",
      },
    ])
    expect(report.counts.ownedPlaylists).toMatchObject({ added: 1, skipped: 1 })
  })

  test("a destination playlist with the same name is left untouched", async () => {
    fake.addPlaylist("new", {
      id: "existing",
      name: "Running",
      items: [{ uri: "spotify:track:keep", addedAt: null }],
    })
    const snap = snapshot({
      playlists: [
        {
          id: "src1",
          name: "Running",
          description: "",
          public: true,
          collaborative: false,
          owned: true,
          items: tracks(3),
        },
      ],
    })
    const report = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })
    expect(fake.playlists.get("existing")?.items.map((i) => i.uri)).toEqual(["spotify:track:keep"])
    expect([...fake.playlists.values()].filter((p) => p.ownerId === "new")).toHaveLength(1)
    expect(report.counts.ownedPlaylists).toEqual({
      created: 0,
      added: 0,
      alreadyThere: 1,
      skipped: 0,
    })
  })

  test("library items are saved only when missing, 40 per request", async () => {
    const newUser = fake.users.get("new")
    newUser?.liked.push({ uri: "spotify:track:t0", addedAt: "2025-01-01T00:00:00Z" })
    newUser?.artists.push("spotify:artist:r1")
    const followedPlaylist = fake.addPlaylist("friend", { id: "theirs", name: "Theirs" })
    const snap = snapshot({
      playlists: [
        {
          id: followedPlaylist.id,
          name: "Theirs",
          description: "",
          public: true,
          collaborative: false,
          owned: false,
          items: [],
        },
      ],
      likedTracks: tracks(90),
      savedAlbums: [{ uri: "spotify:album:a1", addedAt: null }],
      followedArtists: [{ uri: "spotify:artist:r1" }, { uri: "spotify:artist:r2" }],
    })
    const report = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })
    expect(newUser?.liked).toHaveLength(90)
    expect(newUser?.playlists).toContain("theirs")
    expect(newUser?.albums.map((a) => a.uri)).toEqual(["spotify:album:a1"])
    expect(newUser?.artists).toEqual(["spotify:artist:r1", "spotify:artist:r2"])
    expect(fake.log.filter((l) => l === "PUT /me/library").length).toBeGreaterThanOrEqual(
      3 + 1 + 1 + 1,
    )
    expect(report.counts.liked).toEqual({ created: 0, added: 89, alreadyThere: 1, skipped: 0 })
    expect(report.counts.followedPlaylists).toEqual({
      created: 0,
      added: 1,
      alreadyThere: 0,
      skipped: 0,
    })
    expect(report.counts.artists).toEqual({ created: 0, added: 1, alreadyThere: 1, skipped: 0 })
  })

  test("liked songs are saved oldest first so the newest stays on top", async () => {
    const snap = snapshot({
      likedTracks: [
        { uri: "spotify:track:newest", addedAt: "2024-03-01T00:00:00Z" },
        { uri: "spotify:track:middle", addedAt: "2023-03-01T00:00:00Z" },
        { uri: "spotify:track:undated", addedAt: null },
        { uri: "spotify:track:oldest", addedAt: "2010-03-01T00:00:00Z" },
      ],
    })
    await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })
    // One request: the fake stores them in the order of the uris parameter.
    expect(fake.users.get("new")?.liked.map((t) => t.uri.split(":")[2])).toEqual([
      "undated",
      "oldest",
      "middle",
      "newest",
    ])
  })

  test("running twice writes nothing the second time", async () => {
    const snap = snapshot({
      playlists: [
        {
          id: "src1",
          name: "A",
          description: "",
          public: true,
          collaborative: false,
          owned: true,
          items: tracks(5),
        },
      ],
      likedTracks: tracks(5, "l"),
    })
    const progress = memoryProgressStore()
    await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress,
    })
    const before = fake.log.length
    const second = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress,
    })
    const writes = fake.log.slice(before).filter((l) => !l.startsWith("GET"))
    expect(writes).toEqual([])
    expect(second.counts.ownedPlaylists).toEqual({
      created: 0,
      added: 0,
      alreadyThere: 1,
      skipped: 0,
    })
    expect(second.counts.liked).toEqual({ created: 0, added: 0, alreadyThere: 5, skipped: 0 })
  })

  test("resumes a half-copied playlist from the stored count without duplicates", async () => {
    const snap = snapshot({
      playlists: [
        {
          id: "src1",
          name: "Big",
          description: "",
          public: true,
          collaborative: false,
          owned: true,
          items: tracks(250),
        },
      ],
    })
    const progress = memoryProgressStore()
    let posts = 0
    // 503 is retried by the client (5 attempts); fail all of them for the 2nd chunk so it is fatal.
    fake.intercept = (method, url) => {
      if (method === "POST" && url.pathname.endsWith("/items")) {
        posts++
        if (posts >= 2 && posts <= 6) return 503
      }
      return null
    }
    const first = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress,
    })
    expect(first.aborted).toBe(true)
    const dest = [...fake.playlists.values()].find((p) => p.ownerId === "new")
    expect(dest?.items).toHaveLength(100)

    fake.intercept = null
    const second = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress,
    })
    expect(second.aborted).toBe(false)
    expect(dest?.items.map((i) => i.uri)).toEqual(tracks(250).map((t) => t.uri))
    expect([...fake.playlists.values()].filter((p) => p.ownerId === "new")).toHaveLength(1)
    expect(second.counts.ownedPlaylists).toMatchObject({ created: 0, added: 150 })
  })

  test("a copy the user deleted since the last run is copied again", async () => {
    const snap = snapshot({
      playlists: [
        {
          id: "src1",
          name: "A",
          description: "",
          public: true,
          collaborative: false,
          owned: true,
          items: tracks(3),
        },
      ],
    })
    const progress = memoryProgressStore()
    await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress,
    })
    const first = [...fake.playlists.values()].find((p) => p.ownerId === "new")
    const newUser = fake.users.get("new")
    if (!first || !newUser) throw new Error("setup")
    newUser.playlists = newUser.playlists.filter((id) => id !== first.id)
    const second = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress,
    })
    expect(second.counts.ownedPlaylists).toEqual({
      created: 1,
      added: 3,
      alreadyThere: 0,
      skipped: 0,
    })
  })

  test("a rejected chunk is reported and the run continues", async () => {
    fake.intercept = (method, url) =>
      method === "PUT" && url.searchParams.get("uris")?.includes("spotify:album:bad") ? 400 : null
    const snap = snapshot({
      savedAlbums: [{ uri: "spotify:album:bad", addedAt: null }],
      followedArtists: [{ uri: "spotify:artist:ok" }],
    })
    const report = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })
    expect(report.skipped).toEqual([
      { phase: "albums", uri: "spotify:album:bad", reason: "api-error" },
    ])
    expect(report.counts.albums.skipped).toBe(1)
    expect(fake.users.get("new")?.artists).toEqual(["spotify:artist:ok"])
    expect(report.aborted).toBe(false)
  })

  test("abort stops the run and still returns a report", async () => {
    const controller = new AbortController()
    const snap = snapshot({ likedTracks: tracks(200) })
    const events: Progress[] = []
    const report = await writeLibrary({
      client: clientFor("new", controller.signal),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
      onProgress: (p) => {
        events.push(p)
        if (p.done >= 40) controller.abort()
      },
    })
    expect(report.aborted).toBe(true)
    expect(fake.users.get("new")?.liked.length).toBe(40)
  })

  test("only selected phases are written", async () => {
    const snap = snapshot({
      likedTracks: tracks(2),
      followedArtists: [{ uri: "spotify:artist:x" }],
    })
    await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: { ...ALL_SELECTED, liked: false },
      progress: memoryProgressStore(),
    })
    expect(fake.users.get("new")?.liked).toEqual([])
    expect(fake.users.get("new")?.artists).toEqual(["spotify:artist:x"])
  })
})

describe("reader → writer round trip", () => {
  test("the new account ends up with the old account's library", async () => {
    const old = fake.users.get("old")
    fake.addPlaylist("old", { id: "mine", name: "Mine", public: false, items: tracks(130, "m") })
    fake.addPlaylist("friend", { id: "theirs", name: "Theirs" }, ["old"])
    for (let i = 0; i < 70; i++)
      old?.liked.push({
        uri: `spotify:track:l${i}`,
        addedAt: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
      })
    old?.albums.push({ uri: "spotify:album:a", addedAt: "2020-01-01T00:00:00Z" })
    old?.artists.push("spotify:artist:x", "spotify:artist:y")

    const { snapshot: snap } = await readLibrary(clientFor("old"), ALL_SELECTED)
    const report = await writeLibrary({
      client: clientFor("new"),
      snapshot: snap,
      selection: ALL_SELECTED,
      progress: memoryProgressStore(),
    })

    const neu = fake.users.get("new")
    const copy = [...fake.playlists.values()].find((p) => p.ownerId === "new")
    expect(copy?.name).toBe("Mine")
    expect(copy?.items.map((i) => i.uri)).toEqual(tracks(130, "m").map((t) => t.uri))
    expect(neu?.playlists).toContain("theirs")
    expect(neu?.liked.map((t) => t.uri)).toEqual(old?.liked.map((t) => t.uri))
    expect(neu?.albums.map((a) => a.uri)).toEqual(["spotify:album:a"])
    expect(neu?.artists).toEqual(["spotify:artist:x", "spotify:artist:y"])
    expect(report.skipped).toEqual([])
  })
})
