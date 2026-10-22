import type { Role } from "@/lib/pkce"
import { createClient } from "@/lib/spotify-api"
import { FakeSpotify } from "@/test/fake-spotify"
import type { Backend } from "./backend"

/**
 * Demo backend (`?demo=1`): two fake accounts in memory so anyone can click through the
 * whole flow without a Spotify app. Nothing leaves the page.
 */
export function demoBackend(session: Storage): Backend {
  const fake = seed()
  const key = (role: Role) => `p2p.demo.${role}`
  const slowFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    await new Promise((r) => setTimeout(r, 40))
    return fake.fetch(input, init)
  }) as typeof fetch

  return {
    kind: "demo",
    async connect(role) {
      session.setItem(key(role), role === "source" ? "old" : "new")
      const url = new URL(window.location.href)
      url.searchParams.set("demoLogin", role)
      window.location.assign(url.toString())
    },
    async completeLogin() {
      const url = new URL(window.location.href)
      const role = url.searchParams.get("demoLogin")
      if (role !== "source" && role !== "destination") return null
      url.searchParams.delete("demoLogin")
      window.history.replaceState(null, "", url.toString())
      return { role }
    },
    client(role, signal) {
      const user = session.getItem(key(role)) ?? (role === "source" ? "old" : "new")
      return createClient({
        fetch: slowFetch,
        getToken: async () => `token-${user}`,
        ...(signal ? { signal } : {}),
      })
    },
    isConnected: (role) => session.getItem(key(role)) !== null,
    disconnect: (role) => session.removeItem(key(role)),
    disconnectAll: () => {
      session.removeItem(key("source"))
      session.removeItem(key("destination"))
    },
  }
}

function seed(): FakeSpotify {
  const fake = new FakeSpotify()
  const old = fake.addUser("old", "Alex (old)")
  fake.addUser("new", "Alex (new)")
  fake.addUser("radio", "Spotify")
  let t = Date.parse("2019-01-01T00:00:00Z")
  const at = () => {
    t += 3_600_000
    return new Date(t).toISOString()
  }
  const track = (i: number) => ({ uri: `spotify:track:demo${i}`, addedAt: at() })

  fake.addPlaylist("old", {
    name: "Running 🏃",
    description: "Fast &amp; loud",
    public: false,
    items: Array.from({ length: 140 }, (_, i) => track(i)),
  })
  fake.addPlaylist("old", {
    name: "Sunday morning",
    items: [
      ...Array.from({ length: 35 }, (_, i) => track(200 + i)),
      { uri: "spotify:local:Me:Demo:Voice memo:61", addedAt: at(), isLocal: true },
      { uri: "spotify:track:gone", addedAt: at(), unavailable: true },
    ],
  })
  fake.addPlaylist("old", {
    name: "Road trip",
    items: Array.from({ length: 62 }, (_, i) => track(300 + i)),
  })
  fake.addPlaylist("radio", { name: "Today's Top Hits", items: [] }, ["old"])
  fake.addPlaylist("radio", { name: "Lo-fi Beats", items: [] }, ["old"])
  for (let i = 0; i < 230; i++) old.liked.push({ uri: `spotify:track:liked${i}`, addedAt: at() })
  for (let i = 0; i < 37; i++) old.albums.push({ uri: `spotify:album:demo${i}`, addedAt: at() })
  for (let i = 0; i < 64; i++) old.artists.push(`spotify:artist:demo${i}`)
  return fake
}
