import { FileUp } from "lucide-react"
import { useRef, useState } from "react"
import { useApp } from "@/app/context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"
import { parseSnapshot } from "@/lib/snapshot"

export function Import() {
  const { setSnapshot } = useApp()
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<"not-json" | "unsupported-version" | "invalid" | null>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("import.title")}</CardTitle>
        <CardDescription>{t("import.body")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{t(`import.invalid.${error}`)}</AlertDescription>
          </Alert>
        )}
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (!file) return
            const result = parseSnapshot(await file.text())
            if (result.ok) {
              setError(null)
              setSnapshot(result.snapshot)
            } else setError(result.reason)
          }}
        />
        <Button size="lg" className="w-full" onClick={() => input.current?.click()}>
          <FileUp />
          {t("import.choose")}
        </Button>
      </CardContent>
    </Card>
  )
}
