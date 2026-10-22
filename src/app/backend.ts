import {
  type AuthDeps,
  clearAuth,
  forgetRole,
  getAccessToken,
  handleCallback,
  hasToken,
  startLogin,
} from "@/lib/auth"
import type { Role } from "@/lib/pkce"
import { createClient, type SpotifyClient } from "@/lib/spotify-api"

/** What the UI needs from "Spotify", real or demo. */
export type Backend = {
  kind: "real" | "demo"
  /** Starts the login for a role (real: navigates away to Spotify). */
  connect(role: Role): Promise<void>
  /** Finishes an OAuth redirect if the current URL is one. */
  completeLogin(): Promise<{ role: Role } | null>
  client(role: Role, signal?: AbortSignal): SpotifyClient
  isConnected(role: Role): boolean
  disconnect(role: Role): void
  disconnectAll(): void
}

export function realBackend(deps: AuthDeps): Backend {
  return {
    kind: "real",
    async connect(role) {
      window.location.assign(await startLogin(deps, role))
    },
    async completeLogin() {
      const params = new URLSearchParams(window.location.search)
      if (!params.has("code") && !params.has("error")) return null
      // Remove code/state from the address bar whatever happens next.
      window.history.replaceState(null, "", window.location.pathname)
      return handleCallback(deps, params)
    },
    client(role, signal) {
      return createClient({
        getToken: (opts) => getAccessToken(deps, role, opts),
        ...(signal ? { signal } : {}),
      })
    },
    isConnected: (role) => hasToken(deps.session, role),
    disconnect: (role) => forgetRole(deps.session, role),
    disconnectAll: () => clearAuth(deps.session),
  }
}
