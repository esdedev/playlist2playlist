import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { App } from "@/app/App"
import { type Backend, realBackend } from "@/app/backend"
import { I18nProvider } from "@/i18n"
import { redirectUriFor, resolveClientId } from "@/lib/config"
import "./index.css"

const isDemo = new URLSearchParams(window.location.search).get("demo") === "1"

function buildRealBackend(): Backend | null {
  const { clientId } = resolveClientId(localStorage, import.meta.env.VITE_SPOTIFY_CLIENT_ID)
  if (!clientId) return null
  return realBackend({
    clientId,
    redirectUri: redirectUriFor(window.location),
    session: sessionStorage,
  })
}

function Root() {
  const [backend, setBackend] = useState<Backend | null>(() => (isDemo ? null : buildRealBackend()))
  const [loading, setLoading] = useState(isDemo)

  useEffect(() => {
    if (!isDemo) return
    // The fake Spotify ships in its own chunk, loaded only when ?demo=1 is present.
    import("@/app/demo").then(({ demoBackend }) => {
      setBackend(demoBackend(sessionStorage))
      setLoading(false)
    })
  }, [])

  if (loading) return null
  return (
    <App
      backend={backend}
      onClientIdChange={() => {
        if (!isDemo) setBackend(buildRealBackend())
      }}
    />
  )
}

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <Root />
      </I18nProvider>
    </StrictMode>,
  )
}
