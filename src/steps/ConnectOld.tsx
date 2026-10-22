import { LogIn } from "lucide-react"
import { useState } from "react"
import { useApp } from "@/app/context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"
import { ErrorAlert } from "./shared"

export function ConnectOld() {
  const { backend } = useApp()
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
            await backend?.connect("source")
          }}
        >
          <LogIn />
          {t("old.button")}
        </Button>
      </CardContent>
    </Card>
  )
}
