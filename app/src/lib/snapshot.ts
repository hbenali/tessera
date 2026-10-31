// A small picture of the room list kept in this browser, so a reload can show real rooms the moment the page paints,
// long before the Matrix SDK and its stores have loaded. SDK-free: the sign-in bundle uses it too.
export interface SnapRoom {
  id: string
  name: string
  lastTs: number
  unread: number
  highlight: number
  isDM: boolean
  encrypted: boolean
  preview: string
  muted: boolean
}

interface Source { id: string; name: string; lastTs: number; unread: number; highlight: number; isDM: boolean; encrypted: boolean; preview: string; notifs: string; isSpace: boolean; invited: boolean }

export const SNAP_KEY = (userId: string) => `tessera.snapshot.${userId}`
export const MAX_ROOMS = 40

/**
 * The first rooms of the list, in order. The text of an encrypted room's last message is never kept: the whole point of
 * end-to-end encryption would be lost to a copy in storage. Its name is, like every room name already is in the sync cache.
 */
export function makeSnapshot(rooms: readonly Source[]): SnapRoom[] {
  return rooms
    .filter((r) => !r.isSpace && !r.invited)
    .slice(0, MAX_ROOMS)
    .map((r) => ({ id: r.id, name: r.name.slice(0, 100), lastTs: r.lastTs, unread: r.unread, highlight: r.highlight, isDM: r.isDM, encrypted: r.encrypted, preview: r.encrypted ? '' : r.preview.slice(0, 120), muted: r.notifs === 'mute' }))
}

const isSnap = (r: unknown): r is SnapRoom => {
  const x = r as SnapRoom
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.lastTs === 'number' && typeof x.unread === 'number' && typeof x.preview === 'string'
}

export function readSnapshot(userId: string, storage: Pick<Storage, 'getItem'> = localStorage): SnapRoom[] {
  try {
    const v = JSON.parse(storage.getItem(SNAP_KEY(userId)) ?? '[]')
    return Array.isArray(v) ? v.filter(isSnap).slice(0, MAX_ROOMS) : []
  } catch {
    return []
  }
}

export function writeSnapshot(userId: string, rooms: readonly Source[], storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(SNAP_KEY(userId), JSON.stringify(makeSnapshot(rooms))) } catch { /* storage may be full or blocked */ }
}

export const clearSnapshot = (userId: string, storage: Pick<Storage, 'removeItem'> = localStorage) => {
  try { storage.removeItem(SNAP_KEY(userId)) } catch { /* nothing to clear */ }
}
