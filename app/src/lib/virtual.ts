// A window over a long list of rows of unknown height: render only what is near the viewport, and stand in for the
// rest with two spacers. SDK-free.
export interface Win {
  start: number
  end: number
  /** Height standing in for the rows before `start`, and after `end`. */
  top: number
  bottom: number
}

/** Below this many rows everything is rendered, exactly as before. */
export const THRESHOLD = 200
export const ESTIMATE = 64
export const OVERSCAN = 1600

/**
 * Which rows to render. `height` is the measured height of a row if it has been drawn, else undefined (then `est`
 * is used). `pin` is a jump target that must be drawn, whatever the scroll position.
 */
export function computeWindow(ids: readonly string[], height: (id: string) => number | undefined, scrollTop: number, viewport: number, pin?: number, est = ESTIMATE, overscan = OVERSCAN): Win {
  const n = ids.length
  if (n <= THRESHOLD) return { start: 0, end: n, top: 0, bottom: 0 }
  const h = (i: number) => height(ids[i]) ?? est
  const lo = scrollTop - overscan
  const hi = scrollTop + viewport + overscan
  let y = 0
  let start = 0
  while (start < n - 1 && y + h(start) <= lo) y += h(start++)
  let end = start
  let yEnd = y
  while (end < n && yEnd < hi) yEnd += h(end++)
  if (pin !== undefined && pin >= 0 && pin < n && (pin < start || pin >= end)) {
    // A jump target far from the viewport: draw around it instead (the view is about to move there), never everything between.
    let at = 0
    for (let i = 0; i < pin; i++) at += h(i)
    return computeWindow(ids, height, Math.max(0, at - viewport / 2), viewport, undefined, est, overscan)
  }
  let total = yEnd
  for (let i = end; i < n; i++) total += h(i)
  return { start, end, top: y, bottom: total - yEnd }
}

/** Height of each row from where each rendered row starts: the row's height is the gap to the next one. */
export function gaps(tops: { id: string; top: number }[], last: { id: string; height: number } | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (let i = 0; i < tops.length - 1; i++) out.set(tops[i].id, Math.round(tops[i + 1].top - tops[i].top))
  if (last) out.set(last.id, Math.round(last.height))
  return out
}

/** Total height of all rows, measured where known and estimated elsewhere. */
export function totalHeight(ids: readonly string[], height: (id: string) => number | undefined, est = ESTIMATE): number {
  let t = 0
  for (const id of ids) t += height(id) ?? est
  return t
}
