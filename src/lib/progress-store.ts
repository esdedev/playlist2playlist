export type PlaylistProgress = { destId: string; written: number }

export type ProgressStore = {
  get(sourcePlaylistId: string): PlaylistProgress | undefined
  set(sourcePlaylistId: string, progress: PlaylistProgress): void
  clear(): void
}

/**
 * Remembers, per (source account, destination account), which destination playlist each
 * source playlist was copied into and how many of its items were already written, so a
 * reload in the middle of a transfer resumes instead of duplicating.
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
  return {
    get: (id) => load()[id],
    set: (id, progress) => {
      const all = load()
      all[id] = progress
      storage.setItem(key, JSON.stringify(all))
    },
    clear: () => storage.removeItem(key),
  }
}

/** In-memory store for tests and import flows that need no resume. */
export function memoryProgressStore(): ProgressStore {
  const map = new Map<string, PlaylistProgress>()
  return {
    get: (id) => map.get(id),
    set: (id, p) => {
      map.set(id, p)
    },
    clear: () => map.clear(),
  }
}
