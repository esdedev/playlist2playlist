import { createContext, type Dispatch, useContext } from "react"
import type { Snapshot } from "@/lib/snapshot"
import type { Backend } from "./backend"
import type { Action, AppState } from "./state"

export type AppContextValue = {
  state: AppState
  dispatch: Dispatch<Action>
  backend: Backend | null
  /** Snapshot loaded from a file (import) or produced by the last read; memory only. */
  snapshot: Snapshot | null
  setSnapshot: (snapshot: Snapshot | null) => void
  openSetup: () => void
  /** A transfer is running in this page: navigation that would unmount it is hidden. */
  busy: boolean
  setBusy: (busy: boolean) => void
  disconnectAll: () => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp outside AppContext")
  return ctx
}
