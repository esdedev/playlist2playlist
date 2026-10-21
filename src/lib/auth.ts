import {
  buildAuthorizeUrl,
  challengeFromVerifier,
  createNonce,
  createVerifier,
  type Role,
} from "./pkce"

const TOKEN_URL = "https://accounts.spotify.com/api/token"
const REFRESH_MARGIN_MS = 5 * 60 * 1000
const PREFIX = "p2p.auth."

export type AuthDeps = {
  clientId: string
  redirectUri: string
  /** sessionStorage in the app: tokens die with the tab, never localStorage. */
  session: Storage
  fetch?: typeof fetch
  now?: () => number
}

export type AuthErrorCode =
  | "bad-state"
  | "denied"
  | "exchange-failed"
  | "not-connected"
  | "refresh-failed"

export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly role?: Role
  constructor(code: AuthErrorCode, role?: Role, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = "AuthError"
    this.code = code
    this.role = role
  }
}

type Pending = { verifier: string; nonce: string }
type Token = { accessToken: string; refreshToken: string; expiresAt: number; clientId: string }

const pendingKey = (role: Role) => `${PREFIX}${role}.pending`
const tokenKey = (role: Role) => `${PREFIX}${role}.token`

function readJson<T>(storage: Storage, key: string): T | null {
  const raw = storage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function startLogin(deps: AuthDeps, role: Role): Promise<string> {
  const verifier = createVerifier()
  const nonce = createNonce()
  deps.session.setItem(pendingKey(role), JSON.stringify({ verifier, nonce } satisfies Pending))
  return buildAuthorizeUrl({
    clientId: deps.clientId,
    redirectUri: deps.redirectUri,
    role,
    challenge: await challengeFromVerifier(verifier),
    state: `${role}.${nonce}`,
  })
}

function parseRole(state: string | null): Role | null {
  const role = state?.split(".")[0]
  return role === "source" || role === "destination" ? role : null
}

/**
 * Completes the OAuth redirect. Returns null when `params` is not a callback,
 * otherwise the role that just connected. Throws AuthError on denial or forgery.
 */
export async function handleCallback(
  deps: AuthDeps,
  params: URLSearchParams,
): Promise<{ role: Role } | null> {
  if (!params.has("code") && !params.has("error")) return null
  const state = params.get("state")
  const role = parseRole(state)
  const pending = role ? readJson<Pending>(deps.session, pendingKey(role)) : null
  if (!role || !pending || state !== `${role}.${pending.nonce}`) {
    throw new AuthError("bad-state", role ?? undefined)
  }
  deps.session.removeItem(pendingKey(role))
  if (params.has("error")) throw new AuthError("denied", role, params.get("error") ?? undefined)

  const token = await tokenRequest(deps, role, "exchange-failed", {
    grant_type: "authorization_code",
    code: params.get("code") ?? "",
    redirect_uri: deps.redirectUri,
    client_id: deps.clientId,
    code_verifier: pending.verifier,
  })
  deps.session.setItem(tokenKey(role), JSON.stringify(token))
  return { role }
}

async function tokenRequest(
  deps: AuthDeps,
  role: Role,
  failCode: AuthErrorCode,
  form: Record<string, string>,
  previousRefresh?: string,
): Promise<Token> {
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis)
  const now = deps.now ?? Date.now
  const res = await doFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error_description?: string
  }
  if (!res.ok || !body.access_token) throw new AuthError(failCode, role, body.error_description)
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? previousRefresh ?? "",
    expiresAt: now() + (body.expires_in ?? 3600) * 1000,
    clientId: deps.clientId,
  }
}

const inFlight = new Map<string, Promise<Token>>()

export async function getAccessToken(
  deps: AuthDeps,
  role: Role,
  opts?: { forceRefresh?: boolean },
): Promise<string> {
  const now = deps.now ?? Date.now
  const token = readJson<Token>(deps.session, tokenKey(role))
  if (!token) throw new AuthError("not-connected", role)
  if (!opts?.forceRefresh && token.expiresAt - now() > REFRESH_MARGIN_MS) return token.accessToken
  if (!token.refreshToken) throw new AuthError("refresh-failed", role)

  // One refresh at a time per refresh token: Spotify may rotate it.
  const key = `${role}:${token.refreshToken}`
  let promise = inFlight.get(key)
  if (!promise) {
    promise = tokenRequest(
      { ...deps, clientId: token.clientId },
      role,
      "refresh-failed",
      {
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        client_id: token.clientId,
      },
      token.refreshToken,
    ).finally(() => inFlight.delete(key))
    inFlight.set(key, promise)
  }
  const fresh = await promise
  deps.session.setItem(tokenKey(role), JSON.stringify(fresh))
  return fresh.accessToken
}

export function hasToken(session: Storage, role: Role): boolean {
  return readJson<Token>(session, tokenKey(role)) !== null
}

export function forgetRole(session: Storage, role: Role): void {
  session.removeItem(tokenKey(role))
  session.removeItem(pendingKey(role))
}

export function clearAuth(session: Storage): void {
  forgetRole(session, "source")
  forgetRole(session, "destination")
}
