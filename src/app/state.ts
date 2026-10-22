import type { Me } from "@/lib/reader"
import type { Report } from "@/lib/report"
import { ALL_SELECTED, type Selection } from "@/lib/snapshot"

export type Mode = "transfer" | "export" | "import"
export type Screen = "setup" | "import" | "old" | "new" | "transfer" | "done"

export type AppError =
  | { kind: "allowlist" }
  | { kind: "same-account" }
  | { kind: "auth"; code: "denied" | "failed" | "expired" }
  | { kind: "run"; message: string }

export type AppState = {
  mode: Mode
  source: Me | null
  destination: Me | null
  selection: Selection
  /** True while a transfer runs; still true after a reload means it was interrupted. */
  running: boolean
  /** "Continue" was pressed on the report: the transfer screen starts again by itself. */
  resumeRequested: boolean
  report: Report | null
  error: AppError | null
}

export const initialState: AppState = {
  mode: "transfer",
  source: null,
  destination: null,
  selection: ALL_SELECTED,
  running: false,
  resumeRequested: false,
  report: null,
  error: null,
}

export type Action =
  | { type: "setMode"; mode: Mode }
  | { type: "connected"; role: "source" | "destination"; me: Me }
  | { type: "disconnected"; role: "source" | "destination" }
  | { type: "selection"; selection: Selection }
  | { type: "runStarted" }
  | { type: "runFinished"; report: Report | null }
  | { type: "runFailed"; message: string }
  | { type: "error"; error: AppError | null }
  | { type: "clearReport"; resume?: boolean }
  | { type: "reset" }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setMode":
      return {
        ...initialState,
        mode: action.mode,
        source: state.source,
        destination: state.destination,
      }
    case "connected":
      return { ...state, [action.role]: action.me, error: null }
    case "disconnected":
      return { ...state, [action.role]: null }
    case "selection":
      return { ...state, selection: action.selection }
    case "runStarted":
      return { ...state, running: true, resumeRequested: false, report: null, error: null }
    case "runFinished":
      return { ...state, running: false, report: action.report }
    case "runFailed":
      return { ...state, running: false, error: { kind: "run", message: action.message } }
    case "error":
      return { ...state, error: action.error }
    case "clearReport":
      return { ...state, report: null, error: null, resumeRequested: action.resume === true }
    case "reset":
      return {
        ...initialState,
        mode: state.mode,
        source: state.source,
        destination: state.destination,
      }
  }
}

/** Which screen to show is derived from the data, never stored. */
export function deriveScreen(
  state: AppState,
  ctx: { needsSetup: boolean; hasImportedSnapshot: boolean },
): Screen {
  if (ctx.needsSetup) return "setup"
  if (state.mode === "import") {
    if (!ctx.hasImportedSnapshot) return "import"
    if (!state.destination) return "new"
  } else {
    if (!state.source) return "old"
    if (state.mode === "transfer" && !state.destination) return "new"
  }
  return state.report ? "done" : "transfer"
}

const STATE_KEY = "p2p.state"

export function loadState(session: Storage): AppState {
  try {
    const raw = session.getItem(STATE_KEY)
    return raw
      ? { ...initialState, ...(JSON.parse(raw) as Partial<AppState>), error: null }
      : initialState
  } catch {
    return initialState
  }
}

export function saveState(session: Storage, state: AppState): void {
  try {
    session.setItem(STATE_KEY, JSON.stringify({ ...state, error: null }))
  } catch {
    // Quota or blocked storage: the flow still works without resume.
  }
}

export function clearState(session: Storage): void {
  try {
    session.removeItem(STATE_KEY)
  } catch {
    // ignore
  }
}
