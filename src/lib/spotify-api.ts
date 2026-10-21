const BASE = "https://api.spotify.com/v1"
const MAX_ATTEMPTS = 5
const BACKOFF_MS = [1000, 2000, 4000, 8000]

export class SpotifyApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = "SpotifyApiError"
    this.status = status
    this.body = body
  }
}

export type GetToken = (opts?: { forceRefresh?: boolean }) => Promise<string>
export type Query = Record<string, string | number | undefined>
export type Page<T> = { items: T[]; total: number }

export type SpotifyClient = {
  get<T>(path: string, query?: Query): Promise<T>
  post<T>(path: string, body?: unknown, query?: Query): Promise<T>
  put<T>(path: string, body?: unknown, query?: Query): Promise<T | null>
  /** Follows `next` links. `key` unwraps responses like `{ artists: { items, next } }`. */
  paginate<T>(path: string, query?: Query, key?: string): AsyncGenerator<Page<T>>
}

export type ClientOptions = {
  getToken: GetToken
  fetch?: typeof fetch
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  signal?: AbortSignal
}

export function abortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError")
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true },
    )
  })
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(path.startsWith("https://") ? path : `${BASE}${path}`)
  for (const [k, v] of Object.entries(query ?? {}))
    if (v !== undefined) url.searchParams.set(k, String(v))
  return url.toString()
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function apiMessage(status: number, body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error
    if (err && typeof err === "object" && "message" in err)
      return `Spotify ${status}: ${String(err.message)}`
    if (typeof err === "string") return `Spotify ${status}: ${err}`
  }
  return `Spotify ${status}`
}

export function createClient(opts: ClientOptions): SpotifyClient {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
  const sleep = opts.sleep ?? defaultSleep
  const signal = opts.signal

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    const url = buildUrl(path, query)
    let refreshed = false
    let forceRefresh = false
    let attempt = 0
    for (;;) {
      if (signal?.aborted) throw abortError()
      attempt++
      const token = await opts.getToken(forceRefresh ? { forceRefresh: true } : undefined)
      forceRefresh = false
      const headers = new Headers({ Authorization: `Bearer ${token}` })
      if (body !== undefined) headers.set("Content-Type", "application/json")
      let res: Response
      try {
        res = await doFetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        })
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError"))
          throw abortError()
        if (attempt >= MAX_ATTEMPTS)
          throw new SpotifyApiError(0, `Network error: ${String(err)}`, null)
        await sleep(BACKOFF_MS[attempt - 1] ?? 8000, signal)
        continue
      }
      if (res.ok) return (await readBody(res)) as T
      const resBody = await readBody(res)
      if (res.status === 401 && !refreshed) {
        refreshed = true
        forceRefresh = true
        attempt--
        continue
      }
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const seconds = Number(res.headers.get("Retry-After"))
        await sleep(((Number.isFinite(seconds) && seconds > 0 ? seconds : 5) + 1) * 1000, signal)
        continue
      }
      if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFF_MS[attempt - 1] ?? 8000, signal)
        continue
      }
      throw new SpotifyApiError(res.status, apiMessage(res.status, resBody), resBody)
    }
  }

  return {
    get: (path, query) => request("GET", path, undefined, query),
    post: (path, body, query) => request("POST", path, body, query),
    put: (path, body, query) => request("PUT", path, body, query),
    async *paginate<T>(path: string, query?: Query, key?: string) {
      let next: string | null = buildUrl(path, query)
      while (next) {
        const res: Record<string, unknown> = await request("GET", next)
        const page = (key ? res[key] : res) as { items: T[]; total?: number; next: string | null }
        yield { items: page.items, total: page.total ?? page.items.length }
        next = page.next
      }
    },
  }
}
