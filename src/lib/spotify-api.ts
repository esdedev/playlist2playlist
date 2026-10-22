const BASE = "https://api.spotify.com/v1"
const MAX_ATTEMPTS = 5
const BACKOFF_MS = [1000, 2000, 4000, 8000]
/** Waits longer than this stop the run (resumable) instead of freezing the page. */
const MAX_WAIT_SECONDS = 60

export class SpotifyApiError extends Error {
  readonly status: number
  readonly body: unknown
  /** True when the request may have been applied (a POST whose answer was lost or 5xx). */
  readonly uncertain: boolean
  constructor(status: number, message: string, body: unknown, uncertain = false) {
    super(message)
    this.name = "SpotifyApiError"
    this.status = status
    this.body = body
    this.uncertain = uncertain
  }
}

/** Spotify asked to wait longer than we are willing to keep the page busy. */
export class RateLimitedError extends SpotifyApiError {
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number, body: unknown) {
    super(429, `Spotify rate limit: retry in ${retryAfterSeconds} s`, body)
    this.name = "RateLimitedError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Retry-After is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 5
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - now) / 1000))
  return 5
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
  /** Called before waiting for a rate limit, with the seconds about to be waited. */
  onWait?: (seconds: number) => void
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

/** Spotify's `next` links do not always repeat every parameter (e.g. additional_types). */
function withMissingParams(next: string, query?: Query): string {
  const url = new URL(next)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && !url.searchParams.has(k)) url.searchParams.set(k, String(v))
  }
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
        // A POST is not idempotent: it may have reached Spotify. Let the caller reconcile.
        if (method === "POST" || attempt >= MAX_ATTEMPTS) {
          throw new SpotifyApiError(0, `Network error: ${String(err)}`, null, method === "POST")
        }
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
        const seconds = parseRetryAfter(res.headers.get("Retry-After"))
        if (seconds > MAX_WAIT_SECONDS) throw new RateLimitedError(seconds, resBody)
        opts.onWait?.(seconds + 1)
        await sleep((seconds + 1) * 1000, signal)
        continue
      }
      if (res.status >= 500 && method === "POST") {
        throw new SpotifyApiError(res.status, apiMessage(res.status, resBody), resBody, true)
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
        next = page.next ? withMissingParams(page.next, query) : null
      }
    },
  }
}
