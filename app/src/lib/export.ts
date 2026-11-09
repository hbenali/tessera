// Export a conversation as pictures (PNG). Everything here reads: nothing is sent to the room or the server, so there is
// no read receipt, no notification and no typing signal. The layout helpers are pure so they can be tested; `renderPages`
// draws on a canvas, with no library.
import { flowRuns, htmlRuns, runsText, QUOTE_INDENT, PRE_PAD, type RLine, type Run } from './richtext'

export interface ExportMsg {
  /** The message as the timeline shows it (markdown.ts output); without it, or with `source`, the raw text is used. */
  html?: string
  id: string
  senderName: string
  body: string
  ts: number
  mine?: boolean
  pending?: boolean
  undecryptable?: boolean
  emote?: boolean
  reactions?: Record<string, number>
  imageMxc?: string
  sticker?: boolean
  attachment?: { name: string }
  audio?: { name: string; voice: boolean }
  location?: { label: string }
  poll?: { start: { question?: string } | unknown }
  sender?: string
  senderAvatar?: string
  edited?: boolean
  mentionsMe?: boolean
  /** The message this one answers: who wrote it and a short text. */
  reply?: { name: string; text: string }
}

export interface Range { from: string | null; to: string | null }

/**
 * The messages from `from` to `to`, both included, oldest first. An empty bound means the start or end of the room.
 * Bounds given in the wrong order are swapped. Returns null when a bound is not among the loaded messages.
 */
export function sliceRange<T extends { id: string; pending?: boolean }>(all: readonly T[], range: Range): T[] | null {
  const list = all.filter((m) => !m.pending)
  let a = range.from ? list.findIndex((m) => m.id === range.from) : 0
  let b = range.to ? list.findIndex((m) => m.id === range.to) : list.length - 1
  if (a < 0 || b < 0) return null
  if (a > b) [a, b] = [b, a]
  return list.slice(a, b + 1)
}

/** Break text into lines no wider than `max`, on spaces, cutting a word that is wider than a whole line. */
export function wrapText(text: string, max: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/(?<=\s)/)) {
      if (line && measure((line + word).trimEnd()) <= max) { line += word; continue }
      if (line) out.push(line.trimEnd())
      line = word
      while (measure(line.trimEnd()) > max && line.length > 1) {
        let n = line.length - 1
        while (n > 1 && measure(line.slice(0, n)) > max) n--
        out.push(line.slice(0, n))
        line = line.slice(n)
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

/** Group consecutive heights into pages no taller than `max` (one block taller than a page gets a page of its own). */
export function paginate(heights: readonly number[], max: number): number[][] {
  const pages: number[][] = []
  let cur: number[] = []
  let h = 0
  heights.forEach((x, i) => {
    if (cur.length && h + x > max) { pages.push(cur); cur = []; h = 0 }
    cur.push(i)
    h += x
  })
  if (cur.length) pages.push(cur)
  return pages
}

/** A safe file name, for example "support-2026-11-09-2.png". */
export function fileName(room: string, date: Date, page: number, pages: number, ext = 'png'): string {
  const slug = room.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'chat'
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `${slug}-${d}${pages > 1 ? `-${page}` : ''}.${ext}`
}

/** The message as styled runs: rendered by default, the raw source when `source` is set. */
export function messageRuns(m: ExportMsg, source = false): Run[] {
  let runs: Run[]
  if (m.imageMxc && !m.attachment) runs = []
  else if (m.undecryptable || m.poll || m.location || m.audio || m.attachment) runs = [{ text: bodyText(m) }]
  else runs = !source && m.html !== undefined ? htmlRuns(m.html) : [{ text: m.body }]
  if (m.edited && runs.length) runs = [...runs, { text: ' (edited)', dim: true }]
  return m.emote ? [{ text: `* ${m.senderName} `, bold: true }, ...runs] : runs
}

/** What a message without text shows instead. */
export function bodyText(m: ExportMsg): string {
  if (m.undecryptable) return '🔒 Unable to decrypt this message'
  if (m.poll) return '📊 Poll'
  if (m.location) return `📍 ${m.location.label || 'Location'}`
  if (m.audio) return `${m.audio.voice ? '🎤 Voice message' : '🎵 Audio'}: ${m.audio.name}`
  if (m.attachment) return m.body && m.body !== m.attachment.name ? `📎 ${m.attachment.name}\n${m.body}` : `📎 ${m.attachment.name}`
  return m.body
}

export const WIDTH = 720
export const SCALE = 2
export const MAX_PAGE = 6000 // CSS pixels: 12000 device pixels, under every browser's canvas limit
export const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Color Emoji", sans-serif'
export const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace'

/** The colours of the chat. `tones` are the six avatar colours (--t0 to --t5). */
export interface Theme { bg: string; panel: string; tile: string; line: string; text: string; muted: string; accent: string; accentInk: string; ink: string; ok: string; tones: string[] }

export type Look = 'app' | 'light' | 'dark'
const TONES = ['#f08a72', '#efc352', '#52c2b2', '#8f9dff', '#f093b9', '#9fd16f']
const LIGHT: Theme = { bg: '#ffffff', panel: '#f5f6f8', tile: '#eceef2', line: '#e2e5ea', text: '#14171c', muted: '#596273', accent: '#2c5ce6', accentInk: '#ffffff', ink: '#12141a', ok: '#0a6b49', tones: TONES }
const DARK: Theme = { bg: '#0f1115', panel: '#14171c', tile: '#1b1f26', line: '#232832', text: '#e9ebf0', muted: '#8c94a3', accent: '#6b95ff', accentInk: '#0a1020', ink: '#12141a', ok: '#43d19e', tones: TONES }
/** The colours of the picture: the app's current ones, or a fixed light or dark set (light prints and shares better). */
export const pickTheme = (look: Look, app: Theme): Theme => (look === 'light' ? LIGHT : look === 'dark' ? DARK : app)

export function readTheme(): Theme {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    bg: v('--bg', DARK.bg), panel: v('--panel', DARK.panel), tile: v('--tile', DARK.tile), line: v('--line', DARK.line), text: v('--text', DARK.text), muted: v('--muted', DARK.muted),
    accent: v('--accent', DARK.accent), accentInk: v('--accent-ink', DARK.accentInk), ink: v('--ink', DARK.ink), ok: v('--ok', DARK.ok), tones: TONES.map((d, i) => v(`--t${i}`, d)),
  }
}

/** `pct` percent of colour `a` over colour `b` (like CSS color-mix). Only #rrggbb is understood; anything else gives `a`. */
export function mix(a: string, b: string, pct: number): string {
  const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null)
  const x = hex(a)
  const y = hex(b)
  if (!x || !y) return a
  return '#' + x.map((v, i) => Math.round((v * pct + y[i] * (100 - pct)) / 100).toString(16).padStart(2, '0')).join('')
}

export const download = async (c: HTMLCanvasElement, name: string) => saveBlob(await canvasBlob(c, 'image/png'), name)

/** A CSV cell. Text that a spreadsheet would run as a formula (= + - @ at the start) is made inert with a leading apostrophe. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export type CsvMsg = ExportMsg

/** The messages as CSV text (with a byte order mark, so Excel reads the UTF-8): time, sender, sender id, message, reactions. */
export function toCsv(msgs: readonly CsvMsg[], source = false): string {
  const rows = [['Time (ISO 8601)', 'Sender', 'Sender ID', 'Message', 'Reactions']]
  for (const m of msgs) rows.push([new Date(m.ts).toISOString(), m.senderName, m.sender ?? '', runsText(messageRuns(m, source)) || (m.imageMxc ? '[image]' : ''), Object.entries(m.reactions ?? {}).map(([k, n]) => `${k} ${n}`).join(' ')])
  return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export interface PdfPage { jpeg: Uint8Array; width: number; height: number }

/** A PDF with one page per picture (a JPEG is embedded as it is, so no library is needed). Sizes are in CSS pixels. */
export function buildPdf(pages: readonly PdfPage[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length }
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = len
    push(`${n} 0 obj\n${body}`)
    if (stream) { push('\nstream\n'); push(stream); push('\nendstream') }
    push('\nendobj\n')
  }
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  pages.forEach((p, i) => {
    const base = 3 + i * 3
    const w = +(p.width * 0.75).toFixed(2)
    const h = +(p.height * 0.75).toFixed(2)
    obj(base, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`)
    const draw = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`)
    obj(base + 1, `<< /Length ${draw.length} >>`, draw)
    obj(base + 2, `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`, p.jpeg)
  })
  const count = 3 + pages.length * 3
  const xref = len
  push(`xref\n0 ${count}\n0000000000 65535 f \n` + offsets.slice(1, count).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join(''))
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(len)
  let at = 0
  for (const b of parts) { out.set(b, at); at += b.length }
  return out
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

export const canvasBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image'))), type, q))
