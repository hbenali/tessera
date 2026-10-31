// Order and describe a user's sessions (devices) for the Sessions list. SDK-free.
export interface Device {
  id: string
  name: string
  lastIp?: string
  lastTs?: number
  current: boolean
  verified?: boolean
}

const DAY = 86_400_000
export const STALE_DAYS = 90

/** This session first, then the most recently seen; sessions never seen go last. */
export const orderDevices = (list: Device[]): Device[] =>
  [...list].sort((a, b) => Number(b.current) - Number(a.current) || (b.lastTs ?? 0) - (a.lastTs ?? 0) || a.id.localeCompare(b.id))

export const isStale = (d: Device, now = Date.now()): boolean => !d.current && (!d.lastTs || now - d.lastTs > STALE_DAYS * DAY)

export function lastSeen(d: Device, now = Date.now()): string {
  if (d.current) return 'This session'
  if (!d.lastTs) return 'Never seen'
  const days = Math.floor((now - d.lastTs) / DAY)
  const when = days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return `Last seen ${when}${d.lastIp ? ` from ${d.lastIp}` : ''}`
}

export const deviceTitle = (d: Device): string => d.name.trim() || d.id
