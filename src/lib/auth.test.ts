import { beforeEach, describe, expect, test, vi } from "vitest"
import { memoryStorage } from "@/test/memory-storage"
import {
  type AuthDeps,
  AuthError,
  clearAuth,
  getAccessToken,
  handleCallback,
  hasToken,
  startLogin,
} from "./auth"

let session: Storage
let now: number
let tokenReplies: { status: number; body: unknown }[]
let tokenRequests: URLSearchParams[]

function deps(): AuthDeps {
  return {
    clientId: "client123",
    redirectUri: "http://127.0.0.1:5173/playlist2playlist/",
    session,
    now: () => now,
    fetch: vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      tokenRequests.push(new URLSearchParams(String(init?.body)))
      const reply = tokenReplies.shift() ?? { status: 500, body: {} }
      return new Response(JSON.stringify(reply.body), { status: reply.status })
    }) as unknown as typeof fetch,
  }
}

beforeEach(() => {
  session = memoryStorage()
  now = 1_000_000
  tokenReplies = []
  tokenRequests = []
})

async function login(role: "source" | "destination", refresh = "r1") {
  const url = new URL(await startLogin(deps(), role))
  const state = url.searchParams.get("state") ?? ""
  tokenReplies.push({
    status: 200,
    body: { access_token: "a1", refresh_token: refresh, expires_in: 3600 },
  })
  return handleCallback(deps(), new URLSearchParams({ code: "CODE", state }))
}

describe("auth", () => {
  test("startLogin prefixes state with the role and remembers the verifier", async () => {
    const url = new URL(await startLogin(deps(), "source"))
    expect(url.searchParams.get("state")).toMatch(/^source\./)
    expect(url.searchParams.get("client_id")).toBe("client123")
  })

  test("callback exchanges the code with the verifier and stores the token", async () => {
    expect(await login("source")).toEqual({ role: "source" })
    const req = tokenRequests[0]
    expect(req?.get("grant_type")).toBe("authorization_code")
    expect(req?.get("code")).toBe("CODE")
    expect(req?.get("client_id")).toBe("client123")
    expect(req?.get("redirect_uri")).toBe("http://127.0.0.1:5173/playlist2playlist/")
    expect(req?.get("code_verifier")).toMatch(/^[A-Za-z0-9\-._~]{64}$/)
    expect(hasToken(session, "source")).toBe(true)
    expect(await getAccessToken(deps(), "source")).toBe("a1")
  })

  test("callback with a state we did not issue is rejected", async () => {
    await startLogin(deps(), "source")
    await expect(
      handleCallback(deps(), new URLSearchParams({ code: "X", state: "source.forged" })),
    ).rejects.toBeInstanceOf(AuthError)
    expect(tokenRequests).toHaveLength(0)
  })

  test("callback with error=access_denied reports denial for that role", async () => {
    const url = new URL(await startLogin(deps(), "destination"))
    const state = url.searchParams.get("state") ?? ""
    await expect(
      handleCallback(deps(), new URLSearchParams({ error: "access_denied", state })),
    ).rejects.toMatchObject({ code: "denied", role: "destination" })
  })

  test("returns null when the URL is not an OAuth callback", async () => {
    expect(await handleCallback(deps(), new URLSearchParams(""))).toBeNull()
  })

  test("refreshes when under five minutes remain, keeping the old refresh token", async () => {
    await login("source")
    now += (3600 - 4 * 60) * 1000
    tokenReplies.push({ status: 200, body: { access_token: "a2", expires_in: 3600 } })
    expect(await getAccessToken(deps(), "source")).toBe("a2")
    expect(tokenRequests[1]?.get("grant_type")).toBe("refresh_token")
    expect(tokenRequests[1]?.get("refresh_token")).toBe("r1")
    tokenReplies.push({ status: 200, body: { access_token: "a3", expires_in: 3600 } })
    expect(await getAccessToken(deps(), "source", { forceRefresh: true })).toBe("a3")
    expect(tokenRequests[2]?.get("refresh_token")).toBe("r1")
  })

  test("does not refresh a fresh token", async () => {
    await login("source")
    now += 10 * 60 * 1000
    expect(await getAccessToken(deps(), "source")).toBe("a1")
    expect(tokenRequests).toHaveLength(1)
  })

  test("roles are independent and clearAuth wipes both", async () => {
    await login("source")
    expect(hasToken(session, "destination")).toBe(false)
    await login("destination", "r2")
    expect(hasToken(session, "destination")).toBe(true)
    clearAuth(session)
    expect(hasToken(session, "source")).toBe(false)
    expect(hasToken(session, "destination")).toBe(false)
    await expect(getAccessToken(deps(), "source")).rejects.toMatchObject({
      code: "not-connected",
    })
  })
})
