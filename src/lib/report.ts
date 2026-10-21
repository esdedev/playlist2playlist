export const PHASES = ["ownedPlaylists", "followedPlaylists", "liked", "albums", "artists"] as const
export type Phase = (typeof PHASES)[number]

export type Progress = {
  stage: "read" | "write"
  phase: Phase
  done: number
  total: number
  /** Playlist being processed, when relevant. */
  label?: string
}
export type OnProgress = (progress: Progress) => void

export type PhaseCounts = {
  /** Playlists created in the destination (owned playlists only). */
  created: number
  /** Items added: tracks into playlists, or library entries saved/followed. */
  added: number
  /** Already present in the destination: nothing written. */
  alreadyThere: number
  /** Could not be written; details in `Report.skipped`. */
  skipped: number
}

export type SkipReason = "local" | "api-error"

export type SkippedEntry = { phase: Phase; uri: string; reason: SkipReason; playlist?: string }

export type Report = {
  counts: Record<Phase, PhaseCounts>
  skipped: SkippedEntry[]
  /** Playlist items Spotify returned as unavailable while reading the source. */
  unavailableOnRead: number
  finishedAt: string
  aborted: boolean
  error?: string
}

export function emptyReport(): Report {
  const zero = (): PhaseCounts => ({ created: 0, added: 0, alreadyThere: 0, skipped: 0 })
  return {
    counts: {
      ownedPlaylists: zero(),
      followedPlaylists: zero(),
      liked: zero(),
      albums: zero(),
      artists: zero(),
    },
    skipped: [],
    unavailableOnRead: 0,
    finishedAt: "",
    aborted: false,
  }
}
