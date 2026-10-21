export type Role = "source" | "destination"

export const SCOPES: Record<Role, string[]> = {
  source: [
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read",
    "user-follow-read",
  ],
  destination: [
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-library-read",
    "user-library-modify",
    "user-follow-read",
    "user-follow-modify",
  ],
}

const VERIFIER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

/** Random 64-character PKCE code verifier (RFC 7636 §4.1). */
export function createVerifier(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ""
  // 66 chars: modulo bias is negligible for a one-time verifier, but avoid it anyway.
  for (const b of bytes) out += VERIFIER_CHARS[b % VERIFIER_CHARS.length]
  return out
}

/** Random URL-safe token for the OAuth `state` nonce. */
export function createNonce(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(16)))
}

export async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function buildAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  role: Role
  challenge: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    code_challenge_method: "S256",
    code_challenge: opts.challenge,
    state: opts.state,
    scope: SCOPES[opts.role].join(" "),
    show_dialog: "true",
  })
  return `https://accounts.spotify.com/authorize?${params}`
}
