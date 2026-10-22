import { AlertCircle, Check, Copy, UserRound } from "lucide-react"
import { useState } from "react"
import { useApp } from "@/app/context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"

/** Shows the current app-level error, if any. */
export function ErrorAlert() {
  const { state, openSetup } = useApp()
  const { t } = useI18n()
  const error = state.error
  if (!error) return null
  if (error.kind === "allowlist") {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle />
        <AlertTitle>{t("allowlist.title")}</AlertTitle>
        <AlertDescription>
          <p>{t("allowlist.body")}</p>
          <Button variant="link" className="h-auto p-0" onClick={openSetup}>
            {t("footer.ownClientId")}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  const text =
    error.kind === "same-account"
      ? t("new.sameAccount")
      : error.kind === "auth"
        ? t(error.code === "denied" ? "auth.denied" : "auth.failed")
        : t("transfer.failed", { error: error.message })
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  )
}

export function AccountLine({ label, onChange }: { label: string; onChange?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <UserRound className="size-4 shrink-0 text-primary" />
        <span className="truncate">{label}</span>
      </span>
      {onChange && (
        <Button variant="ghost" size="sm" onClick={onChange}>
          {t("common.change")}
        </Button>
      )}
    </div>
  )
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">
          {value}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              // Clipboard blocked: the value is visible and selectable anyway.
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
      </div>
    </div>
  )
}
