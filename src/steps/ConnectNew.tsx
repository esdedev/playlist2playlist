import { LogIn } from "lucide-react"
import { useState } from "react"
import { useApp } from "@/app/context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"
import { AccountLine, ErrorAlert } from "./shared"

export function ConnectNew() {
  const { state, backend, dispatch, setSnapshot } = useApp()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("new.title")}</CardTitle>
        <CardDescription>{t("new.body")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.mode === "import" ? null : state.source ? (
          <AccountLine
            label={t("old.connectedAs", { name: state.source.displayName })}
            onChange={() => {
              backend?.disconnect("source")
              dispatch({ type: "disconnected", role: "source" })
            }}
          />
        ) : null}
        <ErrorAlert />
        <Button
          size="lg"
          className="w-full"
          disabled={busy || !backend}
          onClick={async () => {
            setBusy(true)
            dispatch({ type: "error", error: null })
            try {
              await backend?.connect("destination")
            } catch {
              setBusy(false)
              dispatch({ type: "error", error: { kind: "auth", code: "failed" } })
            }
          }}
        >
          <LogIn />
          {t("new.button")}
        </Button>
        {backend?.kind === "real" && (
          <p className="text-muted-foreground text-sm">
            {t("new.stillOld")}{" "}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href="https://accounts.spotify.com/logout"
              target="_blank"
              rel="noreferrer"
            >
              {t("new.logoutLink")}
            </a>
            {t("new.logoutHint")}
          </p>
        )}
        {state.mode === "import" && (
          <Button variant="ghost" size="sm" onClick={() => setSnapshot(null)}>
            {t("setup.back")}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
