import { describe, expect, test } from "vitest"
import { buildAuthorizeUrl, challengeFromVerifier, createVerifier, SCOPES } from "./pkce"

describe("pkce", () => {
  test("S256 challenge matches the RFC 7636 appendix B vector", async () => {
    expect(await challengeFromVerifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    )
  })

  test("verifier is 64 URL-safe characters and random", () => {
    const a = createVerifier()
    const b = createVerifier()
    expect(a).toMatch(/^[A-Za-z0-9\-._~]{64}$/)
    expect(a).not.toBe(b)
  })

  test("authorize URL carries everything Spotify needs", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "abc",
        redirectUri: "https://esdedev.github.io/playlist2playlist/",
        role: "destination",
        challenge: "CH",
        state: "destination.nonce",
      }),
    )
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize")
    const p = url.searchParams
    expect(p.get("client_id")).toBe("abc")
    expect(p.get("response_type")).toBe("code")
    expect(p.get("redirect_uri")).toBe("https://esdedev.github.io/playlist2playlist/")
    expect(p.get("code_challenge_method")).toBe("S256")
    expect(p.get("code_challenge")).toBe("CH")
    expect(p.get("state")).toBe("destination.nonce")
    expect(p.get("show_dialog")).toBe("true")
    expect(p.get("scope")).toBe(SCOPES.destination.join(" "))
  })

  test("source only asks for read scopes", () => {
    expect(SCOPES.source.every((s) => s.endsWith("-read") || s.includes("-read-"))).toBe(true)
  })
})
