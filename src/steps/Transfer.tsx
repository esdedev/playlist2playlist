import { ArrowRightLeft, ChevronDown, Download, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useApp } from "@/app/context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { useI18n } from "@/i18n"
import { dateStamp, downloadJson } from "@/lib/download"
import { createProgressStore } from "@/lib/progress-store"
import { type Counts, readCounts, readLibrary } from "@/lib/reader"
import { emptyReport, PHASES, type Phase, type Progress as ProgressEvent } from "@/lib/report"
import { type Selection, type Snapshot, serializeSnapshot } from "@/lib/snapshot"
import { writeLibrary } from "@/lib/writer"
import { AccountLine, ErrorAlert } from "./shared"

const SELECTION_KEY: Record<Phase, keyof Omit<Selection, "excludedPlaylistIds">> = {
  ownedPlaylists: "ownedPlaylists",
  followedPlaylists: "followedPlaylists",
  liked: "liked",
  albums: "albums",
  artists: "artists",
}

function countsFromSnapshot(s: Snapshot): Counts {
  const playlists = s.playlists.map((p) => ({
    id: p.id,
    name: p.name,
    owned: p.owned,
    itemCount: p.items.length,
  }))
  return {
    me: { id: s.source.userId, displayName: s.source.displayName },
    ownedPlaylists: playlists.filter((p) => p.owned).length,
    followedPlaylists: playlists.filter((p) => !p.owned).length,
    liked: s.likedTracks.length,
    albums: s.savedAlbums.length,
    artists: s.followedArtists.length,
    playlists,
  }
}

export function backupFilename(snapshot: Snapshot): string {
  const who =
    snapshot.source.displayName.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "spotify"
  return `playlist2playlist-${who}-${dateStamp()}.json`
}

type Live = {
  stage: "read" | "write"
  phases: Partial<Record<Phase, { done: number; total: number }>>
  label?: string
}

export function Transfer() {
  const { state, dispatch, backend, snapshot, setSnapshot } = useApp()
  const { t, n } = useI18n()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [countsError, setCountsError] = useState<string | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const controller = useRef<AbortController | null>(null)
  const { mode, selection } = state
  const interrupted = state.running && live === null

  useEffect(() => {
    if (mode === "import") {
      if (snapshot) setCounts(countsFromSnapshot(snapshot))
      return
    }
    if (!backend) return
    let cancelled = false
    readCounts(backend.client("source"))
      .then((c) => !cancelled && setCounts(c))
      .catch(
        (err: unknown) =>
          !cancelled && setCountsError(err instanceof Error ? err.message : String(err)),
      )
    return () => {
      cancelled = true
    }
  }, [backend, mode, snapshot])

  const onProgress = (p: ProgressEvent) =>
    setLive((prev) => {
      const phases = prev && prev.stage === p.stage ? prev.phases : {}
      return {
        stage: p.stage,
        phases: { ...phases, [p.phase]: { done: p.done, total: p.total } },
        ...(p.label === undefined ? {} : { label: p.label }),
      }
    })

  async function run() {
    if (!backend) return
    const ctl = new AbortController()
    controller.current = ctl
    dispatch({ type: "runStarted" })
    setLive({ stage: mode === "import" ? "write" : "read", phases: {} })
    try {
      let snap: Snapshot
      let unavailable = 0
      if (mode === "import" && snapshot) {
        snap = snapshot
      } else {
        const result = await readLibrary(
          backend.client("source", ctl.signal),
          selection,
          onProgress,
        )
        snap = result.snapshot
        unavailable = result.unavailable
        setSnapshot(snap)
      }
      if (mode === "export") {
        downloadJson(backupFilename(snap), serializeSnapshot(snap))
        dispatch({
          type: "runFinished",
          report: { ...emptyReport(), finishedAt: new Date().toISOString() },
        })
        return
      }
      if (!state.destination) return
      const report = await writeLibrary({
        client: backend.client("destination", ctl.signal),
        snapshot: snap,
        selection,
        progress: createProgressStore(sessionStorage, snap.source.userId, state.destination.id),
        onProgress,
      })
      report.unavailableOnRead = unavailable
      dispatch({ type: "runFinished", report })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError")
        dispatch({ type: "runFinished", report: null })
      else
        dispatch({ type: "runFailed", message: err instanceof Error ? err.message : String(err) })
    } finally {
      controller.current = null
      setLive(null)
    }
  }

  const running = live !== null
  const phaseCount = (phase: Phase) => (counts ? counts[phase] : 0)
  const selectedPhases = PHASES.filter((p) => selection[SELECTION_KEY[p]])
  const allSelected =
    selectedPhases.length === PHASES.length && selection.excludedPlaylistIds.length === 0
  const nothingSelected = selectedPhases.length === 0
  const setPhase = (phase: Phase, on: boolean) =>
    dispatch({ type: "selection", selection: { ...selection, [SELECTION_KEY[phase]]: on } })
  const togglePlaylist = (id: string, on: boolean) =>
    dispatch({
      type: "selection",
      selection: {
        ...selection,
        excludedPlaylistIds: on
          ? selection.excludedPlaylistIds.filter((x) => x !== id)
          : [...selection.excludedPlaylistIds, id],
      },
    })

  const fromName =
    mode === "import" ? (snapshot?.source.displayName ?? "") : (state.source?.displayName ?? "")
  const toName = state.destination?.displayName ?? ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "export" ? t("footer.exportOnly") : t("transfer.title")}</CardTitle>
        {mode !== "export" && (
          <CardDescription>
            {t(mode === "import" ? "transfer.fromFile" : "transfer.from", {
              from: fromName,
              to: toName,
            })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {mode === "export" && state.source && (
          <AccountLine label={t("old.connectedAs", { name: state.source.displayName })} />
        )}
        <ErrorAlert />
        {countsError && (
          <Alert variant="destructive">
            <AlertDescription>{t("transfer.failed", { error: countsError })}</AlertDescription>
          </Alert>
        )}
        {interrupted && (
          <Alert>
            <AlertDescription>{t("transfer.interrupted")}</AlertDescription>
          </Alert>
        )}

        {!running && (
          <>
            {counts ? (
              <ul className="divide-y rounded-lg border">
                {PHASES.map((phase) => (
                  <li
                    key={phase}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${
                      selection[SELECTION_KEY[phase]] ? "" : "text-muted-foreground line-through"
                    }`}
                  >
                    <span>{t(`phase.${phase}`)}</span>
                    <span className="font-medium tabular-nums">{n(phaseCount(phase))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              !countsError && (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {t("transfer.loading")}
                </p>
              )
            )}

            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={!backend || nothingSelected || (!counts && !countsError)}
              onClick={run}
            >
              {mode === "export" ? <Download /> : <ArrowRightLeft />}
              {mode === "export"
                ? t("export.button")
                : interrupted
                  ? t("transfer.continue")
                  : allSelected
                    ? t("transfer.button")
                    : t("transfer.buttonSelected")}
            </Button>
            {nothingSelected && (
              <p className="text-muted-foreground text-sm">{t("transfer.nothing")}</p>
            )}

            {counts && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="group -ml-2 text-muted-foreground">
                    <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                    {t("transfer.customize")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {PHASES.map((phase) => (
                    <label
                      key={phase}
                      htmlFor={`phase-${phase}`}
                      className="flex items-start gap-3 text-sm"
                    >
                      <Checkbox
                        id={`phase-${phase}`}
                        checked={selection[SELECTION_KEY[phase]]}
                        onCheckedChange={(v) => setPhase(phase, v === true)}
                        className="mt-0.5"
                      />
                      <span>
                        {t(`phase.${phase}`)} ({n(phaseCount(phase))})
                        {(phase === "ownedPlaylists" ||
                          phase === "followedPlaylists" ||
                          phase === "liked") && (
                          <span className="block text-muted-foreground text-xs">
                            {t(`phase.${phase}.hint`)}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                  {counts.playlists.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="group text-muted-foreground">
                          <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                          {t("transfer.playlistsToggle", { n: counts.playlists.length })}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">
                          {counts.playlists.map((p) => {
                            const phaseOn =
                              selection[p.owned ? "ownedPlaylists" : "followedPlaylists"]
                            return (
                              <li key={p.id}>
                                <label
                                  htmlFor={`pl-${p.id}`}
                                  className="flex items-center gap-3 text-sm"
                                >
                                  <Checkbox
                                    id={`pl-${p.id}`}
                                    disabled={!phaseOn}
                                    checked={
                                      phaseOn && !selection.excludedPlaylistIds.includes(p.id)
                                    }
                                    onCheckedChange={(v) => togglePlaylist(p.id, v === true)}
                                  />
                                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                  <span className="text-muted-foreground text-xs tabular-nums">
                                    {p.owned ? n(p.itemCount) : "↗"}
                                  </span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}

        {running && live && (
          <div className="space-y-4" aria-live="polite">
            <p className="flex items-center gap-2 font-medium text-sm">
              <Loader2 className="size-4 animate-spin text-primary" />
              {mode === "export"
                ? t("export.reading")
                : live.stage === "read"
                  ? t("transfer.reading")
                  : t("transfer.writing")}
            </p>
            <ul className="space-y-3">
              {selectedPhases.map((phase) => {
                const p = live.phases[phase]
                const pct = p ? (p.total === 0 ? 100 : Math.round((p.done / p.total) * 100)) : 0
                return (
                  <li key={phase} className="space-y-1.5">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className={p ? "" : "text-muted-foreground"}>
                        {t(`phase.${phase}`)}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {p ? `${n(p.done)} / ${n(p.total)}` : ""}
                      </span>
                    </div>
                    <Progress value={pct} aria-label={t(`phase.${phase}`)} />
                  </li>
                )
              })}
            </ul>
            {live.label && <p className="truncate text-muted-foreground text-xs">{live.label}</p>}
            <p className="text-muted-foreground text-sm">{t("transfer.running")}</p>
            <Button variant="outline" onClick={() => controller.current?.abort()}>
              {t("transfer.cancel")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
