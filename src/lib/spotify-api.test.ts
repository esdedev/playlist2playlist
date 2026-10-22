import { describe, expect, test, vi } from "vitest"
import { createClient, RateLimitedError, SpotifyApiError } from "./spotify-api"

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error

function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = replies.shift()
    if (!next) throw new Error("no more replies")
    if (next instanceof Error) throw next
    const text = next.body === undefined ? "" : JSON.stringify(next.body)
    return new Response(next.status === 204 ? null : text, {
      status: next.status,
      headers: next.headers,
    })
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

function setup(replies: Reply[], tokens = ["t1", "t2"]) {
  const f = fakeFetch(replies)
  const sleeps: number[] = []
  const waits: number[] = []
  const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
    opts?.forceRefresh ? (tokens[1] ?? "t?") : (tokens[0] ?? "t?"),
  )
  const client = createClient({
    fetch: f.fn,
    getToken,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    onWait: (seconds) => waits.push(seconds),
  })
  return { client, calls: f.calls, sleeps, waits, getToken }
}

describe("spotify-api client", () => {
  test("sends bearer token and query to the v1 base URL", async () => {
    const { client, calls } = setup([{ status: 200, body: { id: "me" } }])
    expect(await client.get("/me", { a: "1" })).toEqual({ id: "me" })
    expect(calls[0]?.url).toBe("https://api.spotify.com/v1/me?a=1")
    expect(new Headers(calls[0]?.init.headers).get("Authorization")).toBe("Bearer t1")
  })

  test("posts JSON bodies", async () => {
    const { client, calls } = setup([{ status: 201, body: { id: "p" } }])
    await client.post("/me/playlists", { name: "x" })
    expect(calls[0]?.init.method).toBe("POST")
    expect(calls[0]?.init.body).toBe('{"name":"x"}')
    expect(new Headers(calls[0]?.init.headers).get("Content-Type")).toBe("application/json")
  })

  test("empty 200 and 204 bodies resolve to null", async () => {
    const { client } = setup([{ status: 200 }, { status: 204 }])
    expect(await client.put("/me/library", undefined, { uris: "x" })).toBeNull()
    expect(await client.put("/me/library", undefined, { uris: "y" })).toBeNull()
  })

  test("paginate follows next links and unwraps a key", async () => {
    const { client, calls } = setup([
      {
        status: 200,
        body: {
          artists: {
            items: [1, 2],
            total: 3,
            next: "https://api.spotify.com/v1/me/following?after=2",
          },
        },
      },
      { status: 200, body: { artists: { items: [3], total: 3, next: null } } },
    ])
    const pages = []
    for await (const page of client.paginate<number>(
      "/me/following",
      { type: "artist" },
      "artists",
    ))
      pages.push(page)
    expect(pages).toEqual([
      { items: [1, 2], total: 3 },
      { items: [3], total: 3 },
    ])
    expect(calls[1]?.url).toBe("https://api.spotify.com/v1/me/following?after=2&type=artist")
  })

  test("429 waits Retry-After plus one second, then retries", async () => {
    const { client, sleeps } = setup([
      { status: 429, headers: { "Retry-After": "3" } },
      { status: 200, body: { ok: true } },
    ])
    expect(await client.get("/me")).toEqual({ ok: true })
    expect(sleeps).toEqual([4000])
  })

  test("5xx and network errors back off 1-2-4-8 s and give up after 5 attempts", async () => {
    const { client, sleeps } = setup([
      { status: 502 },
      new TypeError("network"),
      { status: 500 },
      { status: 503 },
      { status: 500, body: { error: { message: "boom" } } },
    ])
    const err = (await client.get("/me").catch((e: unknown) => e)) as SpotifyApiError
    expect(err).toBeInstanceOf(SpotifyApiError)
    expect(err.status).toBe(500)
    expect(err.message).toContain("boom")
    expect(sleeps).toEqual([1000, 2000, 4000, 8000])
  })

  test("401 refreshes the token once and retries", async () => {
    const { client, calls, getToken } = setup([{ status: 401 }, { status: 200, body: {} }])
    await client.get("/me")
    expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true })
    expect(new Headers(calls[1]?.init.headers).get("Authorization")).toBe("Bearer t2")
  })

  test("a second 401 throws", async () => {
    const { client } = setup([{ status: 401 }, { status: 401 }])
    await expect(client.get("/me")).rejects.toMatchObject({ status: 401 })
  })

  test("4xx other than 401/429 throws immediately with the API message", async () => {
    const { client, sleeps } = setup([
      { status: 403, body: { error: { status: 403, message: "not registered" } } },
    ])
    await expect(client.get("/me")).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("not registered"),
    })
    expect(sleeps).toEqual([])
  })

  test("an aborted signal rejects before calling fetch", async () => {
    const controller = new AbortController()
    controller.abort()
    const f = fakeFetch([{ status: 200, body: {} }])
    const client = createClient({
      fetch: f.fn,
      getToken: async () => "t",
      signal: controller.signal,
    })
    await expect(client.get("/me")).rejects.toMatchObject({ name: "AbortError" })
    expect(f.calls).toHaveLength(0)
  })

  test("a POST that fails with 5xx is not retried: Spotify may have applied it", async () => {
    const { client, sleeps, calls } = setup([{ status: 502 }, { status: 201, body: {} }])
    const err = (await client
      .post("/playlists/x/items", { uris: ["spotify:track:a"] })
      .catch((e: unknown) => e)) as SpotifyApiError
    expect(err).toBeInstanceOf(SpotifyApiError)
    expect(err.uncertain).toBe(true)
    expect(calls).toHaveLength(1)
    expect(sleeps).toEqual([])
  })

  test("a POST that fails on the network is not retried either", async () => {
    const { client, calls } = setup([new TypeError("reset"), { status: 201, body: {} }])
    await expect(client.post("/me/playlists", { name: "x" })).rejects.toMatchObject({
      status: 0,
      uncertain: true,
    })
    expect(calls).toHaveLength(1)
  })

  test("a POST answered 429 is retried: Spotify rejected it before doing anything", async () => {
    const { client, calls } = setup([
      { status: 429, headers: { "Retry-After": "1" } },
      { status: 201, body: { id: "p" } },
    ])
    expect(await client.post("/me/playlists", { name: "x" })).toEqual({ id: "p" })
    expect(calls).toHaveLength(2)
  })

  test("short waits are announced", async () => {
    const { client, waits } = setup([
      { status: 429, headers: { "Retry-After": "7" } },
      { status: 200, body: {} },
    ])
    await client.get("/me")
    expect(waits).toEqual([8])
  })

  test("a long Retry-After stops with a resumable rate-limit error instead of sleeping", async () => {
    const { client, sleeps } = setup([{ status: 429, headers: { "Retry-After": "3600" } }])
    const err = (await client.get("/me").catch((e: unknown) => e)) as RateLimitedError
    expect(err).toBeInstanceOf(RateLimitedError)
    expect(err.retryAfterSeconds).toBe(3600)
    expect(sleeps).toEqual([])
  })

  test("Retry-After as an HTTP date is understood", async () => {
    const inTenSeconds = new Date(Date.now() + 10_000).toUTCString()
    const { client, sleeps } = setup([
      { status: 429, headers: { "Retry-After": inTenSeconds } },
      { status: 200, body: {} },
    ])
    await client.get("/me")
    expect(sleeps[0]).toBeGreaterThanOrEqual(9000)
    expect(sleeps[0]).toBeLessThanOrEqual(12000)
  })

  test("paginate keeps query parameters that a next link dropped", async () => {
    const { client, calls } = setup([
      {
        status: 200,
        body: { items: [1], total: 2, next: "https://api.spotify.com/v1/playlists/p/items?offset=1&limit=50" },
      },
      { status: 200, body: { items: [2], total: 2, next: null } },
    ])
    for await (const _ of client.paginate("/playlists/p/items", {
      limit: 50,
      additional_types: "track,episode",
    })) {
      // drain
    }
    const second = new URL(calls[1]?.url ?? "")
    expect(second.searchParams.get("additional_types")).toBe("track,episode")
    expect(second.searchParams.get("offset")).toBe("1")
  })
})
