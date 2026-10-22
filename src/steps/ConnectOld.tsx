import { LogIn } from "lucide-react"
import { useState } from "react"
import { useApp } from "@/app/context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"
import { ErrorAlert } from "./shared"

export function ConnectOld() {
  const { backend, dispatch } = useApp()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("old.title")}</CardTitle>
        <CardDescription>{t("old.body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ErrorAlert />
        <Button
          size="lg"
          className="w-full"
          disabled={busy || !backend}
          onClick={async () => {
            setBusy(true)
            try {
              await backend?.connect("source")
            } catch {
              setBusy(false)
              dispatch({ type: "error", error: { kind: "auth", code: "failed" } })
            }
          }}
        >
          <LogIn />
          {t("old.button")}
        </Button>
      </CardContent>
    </Card>
  )
}
