import { describe, expect, test } from "vitest"
import { memoryStorage } from "@/test/memory-storage"
import { isValidClientId, redirectUriFor, resolveClientId, setOwnClientId } from "./config"

describe("config", () => {
  test("own Client ID wins over the build default", () => {
    const local = memoryStorage()
    expect(resolveClientId(local, "a".repeat(32))).toEqual({
      clientId: "a".repeat(32),
      kind: "default",
    })
    setOwnClientId(local, "b".repeat(32))
    expect(resolveClientId(local, "a".repeat(32))).toEqual({
      clientId: "b".repeat(32),
      kind: "own",
    })
    setOwnClientId(local, null)
    expect(resolveClientId(local, "")).toEqual({ clientId: null, kind: "none" })
  })

  test("validates the 32-hex Client ID format", () => {
    expect(isValidClientId("0123456789abcdef0123456789ABCDEF")).toBe(true)
    expect(isValidClientId(" 0123456789abcdef0123456789abcdef ")).toBe(true)
    expect(isValidClientId("xyz")).toBe(false)
  })

  test("redirect URI is the page URL without query or hash, ending in a slash", () => {
    expect(
      redirectUriFor({ origin: "https://esdedev.github.io", pathname: "/playlist2playlist" }),
    ).toBe("https://esdedev.github.io/playlist2playlist/")
    expect(
      redirectUriFor({
        origin: "http://127.0.0.1:5173",
        pathname: "/playlist2playlist/index.html",
      }),
    ).toBe("http://127.0.0.1:5173/playlist2playlist/")
  })
})
