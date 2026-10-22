import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
  FileJson,
  RotateCcw,
  Unplug,
} from "lucide-react"
import { useApp } from "@/app/context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useI18n } from "@/i18n"
import { dateStamp, downloadJson } from "@/lib/download"
import { PHASES } from "@/lib/report"
import { serializeSnapshot } from "@/lib/snapshot"
import { backupFilename } from "./Transfer"

export function Done() {
  const { state, dispatch, snapshot, disconnectAll } = useApp()
  const { t, n } = useI18n()
  const report = state.report
  if (!report) return null

  const backupButton = snapshot && (
    <Button
      variant="outline"
      onClick={() => downloadJson(backupFilename(snapshot), serializeSnapshot(snapshot))}
    >
      <FileJson />
      {state.mode === "export" ? t("export.button") : t("done.downloadBackup")}
    </Button>
  )

  if (state.mode === "export") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleCheck className="size-5 text-success" />
            {t("export.title")}
          </CardTitle>
          <CardDescription>{t("export.body")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-2">
          {backupButton}
          <Button variant="ghost" onClick={() => dispatch({ type: "setMode", mode: "transfer" })}>
            {t("transfer.button")}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  const visiblePhases = PHASES.filter((p) => {
    const c = report.counts[p]
    return state.selection[p === "ownedPlaylists" || p === "followedPlaylists" ? p : p] && c
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {report.aborted ? (
            <CircleAlert className="size-5 text-warning" />
          ) : (
            <CircleCheck className="size-5 text-success" />
          )}
          {report.aborted ? t("done.titleAborted") : t("done.title")}
        </CardTitle>
        {report.aborted && (
          <CardDescription>
            {report.error ? `${t("transfer.failed", { error: report.error })} ` : ""}
            {t("done.abortedBody")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {report.aborted && (
          <Button size="lg" className="w-full" onClick={() => dispatch({ type: "clearReport" })}>
            <RotateCcw />
            {t("transfer.continue")}
          </Button>
        )}

        <ul className="divide-y rounded-lg border">
          {visiblePhases.map((phase) => {
            const c = report.counts[phase]
            return (
              <li key={phase} className="space-y-1.5 px-3 py-2.5">
                <div className="font-medium text-sm">{t(`phase.${phase}`)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.created > 0 && <Badge>{t("done.created", { n: c.created })}</Badge>}
                  {c.added > 0 && <Badge>{t("done.added", { n: c.added })}</Badge>}
                  {c.alreadyThere > 0 && (
                    <Badge variant="secondary">{t("done.already", { n: c.alreadyThere })}</Badge>
                  )}
                  {c.skipped > 0 && (
                    <Badge variant="destructive">{t("done.skipped", { n: c.skipped })}</Badge>
                  )}
                  {c.created + c.added + c.alreadyThere + c.skipped === 0 && (
                    <span className="text-muted-foreground text-sm">{n(0)}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {report.skipped.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="group -ml-2">
                <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                {t("done.skippedTitle", { n: report.skipped.length })}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3 text-sm">
                {report.skipped.map((s, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the same local file can appear twice
                  <li key={`${s.uri}-${i}`} className="space-y-0.5">
                    <div className="truncate font-mono text-xs">
                      {s.uri.startsWith("spotify:local:") ? localName(s.uri) : s.uri}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {s.playlist ? `${s.playlist} · ` : ""}
                      {t(`done.reason.${s.reason}`)}
                    </div>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        {report.unavailableOnRead > 0 && (
          <p className="text-muted-foreground text-sm">
            {t("done.unavailable", { n: report.unavailableOnRead })}
          </p>
        )}
        <p className="text-muted-foreground text-sm">{t("done.notCopiedEver")}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => downloadJson(`playlist2playlist-report-${dateStamp()}.json`, report)}
        >
          <Download />
          {t("done.downloadReport")}
        </Button>
        {backupButton}
        <Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
          <RotateCcw />
          {t("done.startOver")}
        </Button>
        <Button variant="ghost" className="text-muted-foreground" onClick={disconnectAll}>
          <Unplug />
          {t("done.disconnect")}
        </Button>
      </CardFooter>
    </Card>
  )
}

/** spotify:local:Artist:Album:Title:Seconds → "Artist – Title" */
function localName(uri: string): string {
  const [, , artist, , title] = uri.split(":").map((p) => decodeURIComponent(p.replace(/\+/g, " ")))
  return [artist, title].filter(Boolean).join(" – ") || uri
}
