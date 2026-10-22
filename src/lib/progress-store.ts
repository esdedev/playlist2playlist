export type PlaylistProgress = {
  /** Destination playlist id. null = a create request was sent but its answer never arrived. */
  destId: string | null
  /** Source items already handled (added or rejected), in order. */
  written: number
  /** Items Spotify refused for this playlist so far; they never count in its total. */
  rejected?: number
}

export type ProgressStore = {
  get(sourcePlaylistId: string): PlaylistProgress | undefined
  set(sourcePlaylistId: string, progress: PlaylistProgress): void
  delete(sourcePlaylistId: string): void
  all(): Record<string, PlaylistProgress>
  clear(): void
}

/**
 * Remembers, per (source account, destination account), which destination playlist each
 * source playlist was copied into and how far, so an interrupted transfer resumes instead of
 * duplicating. It holds no secrets (account ids, playlist ids, counts), so the app keeps it in
 * localStorage: it must survive a closed tab or a browser restart.
 */
export function createProgressStore(
  storage: Storage,
  sourceUserId: string,
  destinationUserId: string,
): ProgressStore {
  const key = `p2p.progress.${sourceUserId}.${destinationUserId}`
  const load = (): Record<string, PlaylistProgress> => {
    try {
      return JSON.parse(storage.getItem(key) ?? "{}") as Record<string, PlaylistProgress>
    } catch {
      return {}
    }
  }
  const save = (all: Record<string, PlaylistProgress>) => {
    try {
      storage.setItem(key, JSON.stringify(all))
    } catch {
      // Blocked storage: resume falls back to the same-name rule and Spotify's own counts.
    }
  }
  return {
    get: (id) => load()[id],
    set: (id, progress) => {
      const all = load()
      all[id] = progress
      save(all)
    },
    delete: (id) => {
      const all = load()
      delete all[id]
      save(all)
    },
    all: load,
    clear: () => storage.removeItem(key),
  }
}

/** In-memory store for tests. */
export function memoryProgressStore(): ProgressStore {
  const map = new Map<string, PlaylistProgress>()
  return {
    get: (id) => map.get(id),
    set: (id, p) => {
      map.set(id, p)
    },
    delete: (id) => {
      map.delete(id)
    },
    all: () => Object.fromEntries(map),
    clear: () => map.clear(),
  }
}
