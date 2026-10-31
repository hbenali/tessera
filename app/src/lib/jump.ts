// Where to jump in a room. SDK-free.
export type Found = { id: string } | 'older' | 'none'

/**
 * The first message after the one I have read up to. `loaded` is the visible messages, oldest first.
 * 'older' means the read marker is not in the loaded window (go back further); 'none' means nothing is unread.
 */
export function firstUnread(loaded: { id: string; mine: boolean }[], readUpTo: string | undefined): Found {
  if (!readUpTo) return loaded.length ? { id: loaded[0].id } : 'none'
  const at = loaded.findIndex((m) => m.id === readUpTo)
  if (at < 0) return 'older'
  const next = loaded.slice(at + 1).find((m) => !m.mine)
  return next ? { id: next.id } : 'none'
}

/** Start of the chosen local day, as a timestamp. Accepts the value of an <input type="date"> (YYYY-MM-DD). */
export function startOfDay(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return undefined
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return Number.isNaN(d.getTime()) || d.getDate() !== +m[3] ? undefined : d.getTime()
}
