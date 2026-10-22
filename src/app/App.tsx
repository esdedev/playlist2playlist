import { Languages } from "lucide-react"
import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { AuthError } from "@/lib/auth"
import { resolveClientId } from "@/lib/config"
import { getMe } from "@/lib/reader"
import type { Snapshot } from "@/lib/snapshot"
import { SpotifyApiError } from "@/lib/spotify-api"
import { ConnectNew } from "@/steps/ConnectNew"
import { ConnectOld } from "@/steps/ConnectOld"
import { Done } from "@/steps/Done"
import { Import } from "@/steps/Import"
import { Setup } from "@/steps/Setup"
import { Transfer } from "@/steps/Transfer"
import type { Backend } from "./backend"
import { AppContext, type AppContextValue } from "./context"
import { Stepper } from "./Stepper"
import { clearState, deriveScreen, loadState, reducer, saveState } from "./state"

const REPO_URL = "https://github.com/esdedev/playlist2playlist"

export type AppProps = {
  backend: Backend | null
  /** Bumped by main.tsx when the Client ID changes so a new backend is built. */
  onClientIdChange: () => void
}

export function App({ backend, onClientIdChange }: AppProps) {
  const { t, lang, setLang } = useI18n()
  const [state, dispatch] = useReducer(reducer, sessionStorage, loadState)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => saveState(sessionStorage, state), [state])

  // Finish an OAuth redirect, then identify the account that just connected.
  useEffect(() => {
    if (!backend) return
    let cancelled = false
    ;(async () => {
      let role: "source" | "destination"
      try {
        const done = await backend.completeLogin()
        if (!done) return
        role = done.role
      } catch (err) {
        if (cancelled) return
        const code = err instanceof AuthError && err.code === "denied" ? "denied" : "failed"
        dispatch({ type: "error", error: { kind: "auth", code } })
        return
      }
      try {
        const me = await getMe(backend.client(role))
        if (cancelled) return
        const source = loadState(sessionStorage).source
        if (role === "destination" && source && source.id === me.id) {
          backend.disconnect("destination")
          dispatch({ type: "error", error: { kind: "same-account" } })
          return
        }
        dispatch({ type: "connected", role, me })
      } catch (err) {
        if (cancelled) return
        backend.disconnect(role)
        const allowlist = err instanceof SpotifyApiError && err.status === 403
        dispatch({
          type: "error",
          error: allowlist ? { kind: "allowlist" } : { kind: "auth", code: "failed" },
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [backend])

  // A token that disappeared (tab closed and restored, storage cleared) means "not connected".
  useEffect(() => {
    if (!backend) return
    if (state.source && !backend.isConnected("source"))
      dispatch({ type: "disconnected", role: "source" })
    if (state.destination && !backend.isConnected("destination")) {
      dispatch({ type: "disconnected", role: "destination" })
    }
  }, [backend, state.source, state.destination])

  const disconnectAll = useCallback(() => {
    backend?.disconnectAll()
    clearState(sessionStorage)
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("p2p.progress.")) sessionStorage.removeItem(key)
    setSnapshot(null)
    dispatch({ type: "disconnected", role: "source" })
    dispatch({ type: "disconnected", role: "destination" })
    dispatch({ type: "setMode", mode: "transfer" })
  }, [backend])

  const ctx = useMemo<AppContextValue>(
    () => ({
      state,
      dispatch,
      backend,
      snapshot,
      setSnapshot,
      openSetup: () => setSetupOpen(true),
      disconnectAll,
    }),
    [state, backend, snapshot, disconnectAll],
  )

  const needsSetup = setupOpen || !backend
  const screen = deriveScreen(state, { needsSetup, hasImportedSnapshot: snapshot !== null })
  const hasOwnClientId =
    resolveClientId(localStorage, import.meta.env.VITE_SPOTIFY_CLIENT_ID).kind === "own"

  return (
    <AppContext.Provider value={ctx}>
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-6 sm:py-10">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-semibold text-xl tracking-tight">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7" />
              playlist2playlist
              {backend?.kind === "demo" && <Badge variant="secondary">{t("app.demo")}</Badge>}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">{t("app.tagline")}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            aria-label={t("footer.language")}
          >
            <Languages />
            {lang === "en" ? "ES" : "EN"}
          </Button>
        </header>

        {backend?.kind === "demo" && (
          <p className="mb-4 rounded-md bg-secondary px-3 py-2 text-secondary-foreground text-sm">
            {t("app.demoNotice")}
          </p>
        )}

        {screen !== "setup" && state.mode === "transfer" && <Stepper screen={screen} />}

        <main className="flex-1">
          {screen === "setup" && (
            <Setup
              canGoBack={setupOpen && backend !== null}
              hasOwnClientId={hasOwnClientId}
              onDone={() => {
                setSetupOpen(false)
                disconnectAll()
                onClientIdChange()
              }}
              onBack={() => setSetupOpen(false)}
            />
          )}
          {screen === "import" && <Import />}
          {screen === "old" && <ConnectOld />}
          {screen === "new" && <ConnectNew />}
          {screen === "transfer" && <Transfer />}
          {screen === "done" && <Done />}
        </main>

        <footer className="mt-10 space-y-3 border-t pt-4 text-muted-foreground text-sm">
          <p>{t("footer.privacy")}</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            {state.mode !== "export" && (
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => dispatch({ type: "setMode", mode: "export" })}
              >
                {t("footer.exportOnly")}
              </button>
            )}
            {state.mode !== "import" && (
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => dispatch({ type: "setMode", mode: "import" })}
              >
                {t("footer.import")}
              </button>
            )}
            {state.mode !== "transfer" && (
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => dispatch({ type: "setMode", mode: "transfer" })}
              >
                {t("transfer.button")}
              </button>
            )}
            {backend?.kind !== "demo" && (
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => setSetupOpen(true)}
              >
                {t("footer.ownClientId")}
              </button>
            )}
            <a
              className="underline-offset-4 hover:underline"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              {t("footer.source")}
            </a>
          </nav>
        </footer>
      </div>
    </AppContext.Provider>
  )
}
