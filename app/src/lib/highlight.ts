export interface Piece {
  text: string
  hit: boolean
}

/** Split text around case-insensitive matches of a term, so a view can wrap matches without touching HTML. */
export function highlight(text: string, term: string): Piece[] {
  const t = term.trim()
  if (!t) return [{ text, hit: false }]
  const out: Piece[] = []
  const lower = text.toLowerCase()
  const needle = t.toLowerCase()
  let at = 0
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, at)) {
    if (i > at) out.push({ text: text.slice(at, i), hit: false })
    out.push({ text: text.slice(i, i + needle.length), hit: true })
    at = i + needle.length
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false })
  return out.length ? out : [{ text, hit: false }]
}
