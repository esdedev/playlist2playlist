/**
 * In-memory Spotify Web API (post February 2026 endpoints) for tests and the dev demo.
 * Enforces the real page and batch limits so the reader and writer are tested against them.
 */

export type FakeItem = {
  uri: string
  addedAt: string | null
  isLocal?: boolean
  unavailable?: boolean
}

export type FakePlaylist = {
  id: string
  name: string
  description: string
  public: boolean
  collaborative: boolean
  ownerId: string
  items: FakeItem[]
}

export type FakeUser = {
  id: string
  displayName: string
  /** Playlist ids in "Your Library" order (own and followed). */
  playlists: string[]
  /** Oldest first, as stored; the API returns them newest first. */
  liked: { uri: string; addedAt: string }[]
  albums: { uri: string; addedAt: string }[]
  artists: string[]
}

type Json = Record<string, unknown> | unknown[] | null

export class FakeSpotify {
  readonly users = new Map<string, FakeUser>()
  readonly playlists = new Map<string, FakePlaylist>()
  readonly tokens = new Map<string, string>()
  /** When set, only these user ids may call the API (Development Mode allow-list). */
  allowList: Set<string> | null = null
  /** Requests seen, as "METHOD /path". */
  readonly log: string[] = []
  /** Return a status for a request instead of handling it (e.g. inject a 400). */
  intercept: ((method: string, url: URL, body: unknown) => number | null) | null = null
  private clock = Date.parse("2026-01-01T00:00:00Z")
  private seq = 0

  addUser(id: string, displayName = id): FakeUser {
    const user: FakeUser = { id, displayName, playlists: [], liked: [], albums: [], artists: [] }
    this.users.set(id, user)
    this.tokens.set(`token-${id}`, id)
    return user
  }

  addPlaylist(
    ownerId: string,
    p: Partial<FakePlaylist> & { name: string },
    followers: string[] = [],
  ): FakePlaylist {
    const playlist: FakePlaylist = {
      id: p.id ?? `pl${++this.seq}`,
      description: "",
      public: true,
      collaborative: false,
      items: [],
      ...p,
      ownerId,
    }
    this.playlists.set(playlist.id, playlist)
    for (const uid of [ownerId, ...followers]) this.users.get(uid)?.playlists.push(playlist.id)
    return playlist
  }

  private tick(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  /** A fetch implementation bound to this fake. */
  readonly fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = (init?.method ?? "GET").toUpperCase()
    const auth = new Headers(init?.headers).get("Authorization") ?? ""
    const userId = this.tokens.get(auth.replace(/^Bearer /, ""))
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const path = url.pathname.replace(/^\/v1/, "")
    this.log.push(`${method} ${path}`)
    const respond = (status: number, json: Json = null) =>
      new Response(json === null ? null : JSON.stringify(json), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    const error = (status: number, message: string) =>
      respond(status, { error: { status, message } })

    if (signalAborted(init?.signal)) throw new DOMException("aborted", "AbortError")
    const forced = this.intercept?.(method, url, body)
    if (forced) return error(forced, "injected")
    if (!userId) return error(401, "Invalid access token")
    if (this.allowList && !this.allowList.has(userId)) {
      return error(
        403,
        "Check settings on developer.spotify.com/dashboard, the user may not be registered.",
      )
    }
    const me = this.users.get(userId) as FakeUser
    const limit = Number(url.searchParams.get("limit") ?? 20)
    const offset = Number(url.searchParams.get("offset") ?? 0)
    const page = <T>(all: T[], max: number) => {
      if (limit < 1 || limit > max) return null
      const next =
        offset + limit < all.length ? withParams(url, { offset: offset + limit, limit }) : null
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset, next }
    }

    let m: RegExpMatchArray | null
    if (method === "GET" && path === "/me")
      return respond(200, { id: me.id, display_name: me.displayName })

    if (method === "GET" && path === "/me/playlists") {
      const all = me.playlists
        .map((id) => this.playlists.get(id) as FakePlaylist)
        .map(simplePlaylist)
      const p = page(all, 50)
      return p ? respond(200, p) : error(400, "Invalid limit")
    }

    if ((m = path.match(/^\/playlists\/([^/]+)\/items$/))) {
      const playlist = this.playlists.get(m[1] ?? "")
      if (!playlist) return error(404, "Not found")
      if (method === "GET") {
        if (playlist.ownerId !== me.id && !playlist.collaborative) return error(403, "Forbidden")
        const all = playlist.items.map((it) => ({
          added_at: it.addedAt,
          is_local: Boolean(it.isLocal),
          item: it.unavailable ? null : { uri: it.uri, type: it.uri.split(":")[1] },
        }))
        const p = page(all, 50)
        return p ? respond(200, p) : error(400, "Invalid limit")
      }
      if (method === "POST") {
        if (playlist.ownerId !== me.id) return error(403, "Forbidden")
        const uris = (body as { uris?: string[] })?.uris ?? []
        if (uris.length < 1 || uris.length > 100) return error(400, "Too many items")
        if (uris.some((u) => !/^spotify:(track|episode):/.test(u))) return error(400, "Invalid URI")
        for (const uri of uris) playlist.items.push({ uri, addedAt: this.tick() })
        return respond(201, { snapshot_id: `snap${++this.seq}` })
      }
    }

    if (method === "GET" && path === "/me/tracks") {
      const all = [...me.liked]
        .reverse()
        .map((t) => ({ added_at: t.addedAt, track: { uri: t.uri } }))
      const p = page(all, 50)
      return p ? respond(200, p) : error(400, "Invalid limit")
    }

    if (method === "GET" && path === "/me/albums") {
      const all = [...me.albums]
        .reverse()
        .map((a) => ({ added_at: a.addedAt, album: { uri: a.uri } }))
      const p = page(all, 50)
      return p ? respond(200, p) : error(400, "Invalid limit")
    }

    if (method === "GET" && path === "/me/following") {
      if (url.searchParams.get("type") !== "artist") return error(400, "type must be artist")
      if (limit < 1 || limit > 50) return error(400, "Invalid limit")
      const after = url.searchParams.get("after")
      const start = after ? me.artists.indexOf(`spotify:artist:${after}`) + 1 : 0
      const items = me.artists
        .slice(start, start + limit)
        .map((uri) => ({ uri, id: uri.split(":")[2] }))
      const last = items.at(-1)
      const hasMore = start + limit < me.artists.length
      return respond(200, {
        artists: {
          items,
          total: me.artists.length,
          limit,
          next: hasMore && last ? withParams(url, { after: last.id ?? "", limit }) : null,
          cursors: { after: hasMore ? (last?.id ?? null) : null },
        },
      })
    }

    if (method === "POST" && path === "/me/playlists") {
      const b = body as Partial<FakePlaylist>
      if (!b?.name) return error(400, "Missing name")
      if (b.collaborative && b.public !== false)
        return error(400, "Collaborative playlists must be private")
      const created = this.addPlaylist(me.id, {
        name: b.name,
        description: b.description ?? "",
        public: b.public ?? true,
        collaborative: b.collaborative ?? false,
      })
      // Spotify puts new playlists at the top of the library.
      me.playlists.pop()
      me.playlists.unshift(created.id)
      return respond(201, simplePlaylist(created))
    }

    if (path === "/me/library" || path === "/me/library/contains") {
      const uris = (url.searchParams.get("uris") ?? "").split(",").filter(Boolean)
      if (uris.length < 1 || uris.length > 40) return error(400, "Between 1 and 40 URIs")
      if (uris.some((u) => !/^spotify:(track|album|artist|playlist):[^:]+$/.test(u))) {
        return error(400, "Unsupported URI")
      }
      if (method === "GET" && path === "/me/library/contains")
        return respond(
          200,
          uris.map((u) => this.has(me, u)),
        )
      if (method === "PUT" && path === "/me/library") {
        for (const uri of uris) this.save(me, uri)
        return respond(200)
      }
    }

    return error(404, `No fake for ${method} ${path}`)
  }) as typeof fetch

  private has(me: FakeUser, uri: string): boolean {
    const [, kind, id] = uri.split(":")
    if (kind === "track") return me.liked.some((t) => t.uri === uri)
    if (kind === "album") return me.albums.some((a) => a.uri === uri)
    if (kind === "artist") return me.artists.includes(uri)
    if (kind === "playlist") return me.playlists.includes(id ?? "")
    return false
  }

  private save(me: FakeUser, uri: string): void {
    if (this.has(me, uri)) return
    const [, kind, id] = uri.split(":")
    if (kind === "track") me.liked.push({ uri, addedAt: this.tick() })
    if (kind === "album") me.albums.push({ uri, addedAt: this.tick() })
    if (kind === "artist") me.artists.push(uri)
    if (kind === "playlist" && id && this.playlists.has(id)) me.playlists.push(id)
  }
}

function simplePlaylist(p: FakePlaylist) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    public: p.public,
    collaborative: p.collaborative,
    owner: { id: p.ownerId },
    items: { total: p.items.length },
  }
}

function withParams(url: URL, params: Record<string, string | number>): string {
  const next = new URL(url)
  for (const [k, v] of Object.entries(params)) next.searchParams.set(k, String(v))
  return next.toString()
}

function signalAborted(signal: AbortSignal | null | undefined): boolean {
  return Boolean(signal?.aborted)
}
