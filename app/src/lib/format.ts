/** Text formatting for the message box: Markdown markers around a selection. Pure. */
export interface Edit {
  text: string
  start: number
  end: number
}

/** Wrap the selection in a marker (`**`, `*`, `~~`, a backtick), or take the marker off if it is already there. */
export function wrap(text: string, start: number, end: number, mark: string): Edit {
  const before = text.slice(0, start)
  const sel = text.slice(start, end)
  const after = text.slice(end)
  // The marker is already just outside the selection: remove it.
  if (before.endsWith(mark) && after.startsWith(mark)) {
    return { text: before.slice(0, -mark.length) + sel + after.slice(mark.length), start: start - mark.length, end: end - mark.length }
  }
  // The selection includes its markers: remove those.
  if (sel.length >= mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, -mark.length)
    return { text: before + inner + after, start, end: start + inner.length }
  }
  if (start === end) {
    // Nothing selected: put the markers down with the caret between them.
    return { text: before + mark + mark + after, start: start + mark.length, end: start + mark.length }
  }
  return { text: before + mark + sel + mark + after, start: start + mark.length, end: end + mark.length }
}

/** Quote the lines the selection touches ("> " at the start of each), or unquote them if they all are. */
export function quote(text: string, start: number, end: number): Edit {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const nl = text.indexOf('\n', end)
  const to = nl === -1 ? text.length : nl
  const lines = text.slice(from, to).split('\n')
  const all = lines.every((l) => l.startsWith('> '))
  const next = lines.map((l) => (all ? l.slice(2) : `> ${l}`))
  const body = next.join('\n')
  const delta = body.length - (to - from)
  return { text: text.slice(0, from) + body + text.slice(to), start: Math.max(from, start + (all ? -2 : 2)), end: end + delta }
}
