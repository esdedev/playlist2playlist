const OWN_CLIENT_ID_KEY = "p2p.ownClientId"

export type ClientIdResolution =
  | { clientId: string; kind: "own" | "default" }
  | { clientId: null; kind: "none" }

/** The user's own Client ID (Advanced) wins over the one baked into the build. */
export function resolveClientId(
  local: Storage,
  buildDefault: string | undefined,
): ClientIdResolution {
  const own = safeGet(local, OWN_CLIENT_ID_KEY)
  if (own && isValidClientId(own)) return { clientId: own.trim(), kind: "own" }
  if (buildDefault && isValidClientId(buildDefault))
    return { clientId: buildDefault.trim(), kind: "default" }
  return { clientId: null, kind: "none" }
}

export function setOwnClientId(local: Storage, clientId: string | null): void {
  try {
    if (clientId) local.setItem(OWN_CLIENT_ID_KEY, clientId.trim())
    else local.removeItem(OWN_CLIENT_ID_KEY)
  } catch {
    // Storage may be blocked (private mode); the value then lasts for this page only.
  }
}

export function isValidClientId(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value.trim())
}

/** Spotify needs the exact URL registered: origin + directory, always ending in "/". */
export function redirectUriFor(location: Pick<Location, "origin" | "pathname">): string {
  const dir = location.pathname.endsWith("/")
    ? location.pathname
    : location.pathname.endsWith(".html")
      ? location.pathname.slice(0, location.pathname.lastIndexOf("/") + 1)
      : `${location.pathname}/`
  return `${location.origin}${dir}`
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}
