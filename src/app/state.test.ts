import { describe, expect, test } from "vitest"
import { memoryStorage } from "@/test/memory-storage"
import { deriveScreen, initialState, loadState, reducer, saveState } from "./state"

const old = { id: "old", displayName: "Old" }
const neu = { id: "new", displayName: "New" }
const ctx = { needsSetup: false, hasImportedSnapshot: false }

describe("deriveScreen", () => {
  test("transfer flow: old → new → transfer → done", () => {
    let s = initialState
    expect(deriveScreen(s, ctx)).toBe("old")
    s = reducer(s, { type: "connected", role: "source", me: old })
    expect(deriveScreen(s, ctx)).toBe("new")
    s = reducer(s, { type: "connected", role: "destination", me: neu })
    expect(deriveScreen(s, ctx)).toBe("transfer")
    s = reducer(s, { type: "runStarted" })
    expect(deriveScreen(s, ctx)).toBe("transfer")
    s = reducer(s, {
      type: "runFinished",
      report: {
        counts: {} as never,
        skipped: [],
        unavailableOnRead: 0,
        finishedAt: "x",
        aborted: false,
      },
    })
    expect(deriveScreen(s, ctx)).toBe("done")
  })

  test("export flow skips the new account", () => {
    const s = reducer(reducer(initialState, { type: "setMode", mode: "export" }), {
      type: "connected",
      role: "source",
      me: old,
    })
    expect(deriveScreen(s, ctx)).toBe("transfer")
  })

  test("import flow: file → new account → transfer", () => {
    const s = reducer(initialState, { type: "setMode", mode: "import" })
    expect(deriveScreen(s, ctx)).toBe("import")
    expect(deriveScreen(s, { ...ctx, hasImportedSnapshot: true })).toBe("new")
    const withDest = reducer(s, { type: "connected", role: "destination", me: neu })
    expect(deriveScreen(withDest, { ...ctx, hasImportedSnapshot: true })).toBe("transfer")
  })

  test("setup wins when there is no Client ID", () => {
    expect(deriveScreen(initialState, { ...ctx, needsSetup: true })).toBe("setup")
  })
})

describe("persistence", () => {
  test("round-trips without the error and keeps running=true to detect interruptions", () => {
    const session = memoryStorage()
    let s = reducer(initialState, { type: "connected", role: "source", me: old })
    s = reducer(s, { type: "runStarted" })
    s = reducer(s, { type: "error", error: { kind: "allowlist" } })
    saveState(session, s)
    const loaded = loadState(session)
    expect(loaded.source).toEqual(old)
    expect(loaded.running).toBe(true)
    expect(loaded.error).toBeNull()
  })

  test("continue from the report asks the transfer screen to start by itself, once", () => {
    let s = reducer(initialState, { type: "clearReport", resume: true })
    expect(s.resumeRequested).toBe(true)
    s = reducer(s, { type: "runStarted" })
    expect(s.resumeRequested).toBe(false)
  })

  test("changing mode keeps connected accounts but clears the run", () => {
    let s = reducer(initialState, { type: "connected", role: "source", me: old })
    s = reducer(s, { type: "runFailed", message: "x" })
    s = reducer(s, { type: "setMode", mode: "export" })
    expect(s.source).toEqual(old)
    expect(s.error).toBeNull()
  })
})
