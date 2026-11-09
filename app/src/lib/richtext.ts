// The chat's Markdown, as the timeline shows it, turned into styled runs a canvas can draw. It reads the (already
// escaped, safe) HTML that markdown.ts produces, so the export always matches what the timeline renders. Pure.
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  link?: boolean
  mention?: boolean
  quote?: boolean
  pre?: boolean
  /** A mention of me. */
  me?: boolean
  /** Small and muted, like "(edited)". */
  dim?: boolean
}
export interface RLine { runs: Run[]; quote?: boolean; pre?: boolean }

const unescapeHtml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
export const QUOTE_INDENT = 12
export const PRE_PAD = 12

export function htmlRuns(html: string): Run[] {
  const out: Run[] = []
  const d = { bold: 0, italic: 0, strike: 0, code: 0, link: 0, mention: 0, quote: 0, pre: 0 }
  let afterBlock = false
  let me = false
  for (const tok of html.split(/(<[^>]*>)/)) {
    if (!tok) continue
    if (tok[0] === '<') {
      const m = /^<(\/?)([a-z0-9]+)([^>]*)>$/i.exec(tok)
      if (!m) continue
      const n = m[1] ? -1 : 1
      const tag = m[2].toLowerCase()
      const key = ({ strong: 'bold', b: 'bold', em: 'italic', i: null, del: 'strike', code: 'code', a: 'link', blockquote: 'quote', pre: 'pre' } as Record<string, keyof typeof d | null>)[tag]
      if (key) d[key] = Math.max(0, d[key] + n)
      else if (tag === 'span' && (n < 0 || /class="mention/.test(m[3]))) { d.mention = Math.max(0, d.mention + n); me = n > 0 && /class="mention me/.test(m[3]) }
      continue
    }
    let text = unescapeHtml(tok)
    const block = d.quote > 0 || d.pre > 0
    if (!block && afterBlock && text.startsWith('\n')) text = text.slice(1) // the line break that ends a quote or code block
    if (!text) continue
    const r: Run = { text }
    if (d.bold) r.bold = true
    if (d.italic) r.italic = true
    if (d.strike) r.strike = true
    if (d.code && !d.pre) r.code = true
    if (d.link) r.link = true
    if (d.mention) r.mention = true
    if (d.mention && me) r.me = true
    if (d.quote) r.quote = true
    if (d.pre) r.pre = true
    out.push(r)
    afterBlock = block
  }
  return out
}

export const runsText = (runs: readonly Run[]) => runs.map((r) => r.text).join('')

/** Lay runs out in lines no wider than `max`: on spaces, at line breaks, cutting a word wider than a line. */
export function flowRuns(runs: readonly Run[], max: number, measure: (r: Run) => number): RLine[] {
  const lines: RLine[] = []
  let cur: RLine = { runs: [] }
  let w = 0
  const avail = () => max - (cur.quote ? QUOTE_INDENT : 0) - (cur.pre ? PRE_PAD * 2 : 0)
  const flush = () => {
    const last = cur.runs.at(-1)
    if (last) { last.text = last.text.trimEnd(); if (!last.text) cur.runs.pop() }
    lines.push(cur)
    cur = { runs: [] }
    w = 0
  }
  const add = (r: Run, text: string) => {
    if (!cur.runs.length) { cur.quote = r.quote; cur.pre = r.pre }
    cur.runs.push({ ...r, text })
    w += measure({ ...r, text })
  }
  for (const r of runs) {
    if (cur.runs.length && (!!r.quote !== !!cur.quote || !!r.pre !== !!cur.pre)) flush() // a quote or code block starts and ends on its own line
    r.text.split('\n').forEach((part, pi) => {
      if (pi > 0) { if (!cur.runs.length) { cur.quote = r.quote; cur.pre = r.pre } flush() }
      for (const word of part.split(/(?<=\s)/)) {
        if (!word) continue
        if (!cur.runs.length) { cur.quote = r.quote; cur.pre = r.pre }
        if (cur.runs.length && w + measure({ ...r, text: word.trimEnd() }) > avail()) flush()
        let piece = word
        while (!cur.runs.length && measure({ ...r, text: piece.trimEnd() }) > avail() && piece.length > 1) {
          cur.quote = r.quote; cur.pre = r.pre
          let n = piece.length - 1
          while (n > 1 && measure({ ...r, text: piece.slice(0, n) }) > avail()) n--
          add(r, piece.slice(0, n))
          flush()
          piece = piece.slice(n)
        }
        add(r, piece)
      }
    })
  }
  if (cur.runs.length) flush()
  return lines
}
