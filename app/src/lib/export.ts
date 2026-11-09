// Export a conversation as pictures (PNG). Everything here reads: nothing is sent to the room or the server, so there is
// no read receipt, no notification and no typing signal. The layout helpers are pure so they can be tested; `renderPages`
// draws on a canvas, with no library.
export interface ExportMsg {
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

/** What a message without text shows instead. */
export function bodyText(m: ExportMsg): string {
  if (m.undecryptable) return '🔒 Unable to decrypt this message'
  if (m.poll) return '📊 Poll'
  if (m.location) return `📍 ${m.location.label || 'Location'}`
  if (m.audio) return `${m.audio.voice ? '🎤 Voice message' : '🎵 Audio'}: ${m.audio.name}`
  if (m.attachment) return m.body && m.body !== m.attachment.name ? `📎 ${m.attachment.name}\n${m.body}` : `📎 ${m.attachment.name}`
  return m.body
}

const WIDTH = 720
const PAD = 20
const SCALE = 2
const MAX_PAGE = 6000 // CSS pixels: 12000 device pixels, under every browser's canvas limit
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Color Emoji", sans-serif'

export interface Theme { bg: string; text: string; muted: string; tile: string; line: string; accent: string }

export function readTheme(): Theme {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return { bg: v('--bg', '#0f1115'), text: v('--text', '#e9ebf0'), muted: v('--muted', '#8c94a3'), tile: v('--tile', '#1b1f26'), line: v('--line', '#232832'), accent: v('--accent', '#6b95ff') }
}

type Block =
  | { kind: 'day'; label: string; h: number }
  | { kind: 'msg'; m: ExportMsg; lines: string[]; img?: ImageBitmap; imgW: number; imgH: number; reacts: string; h: number }

export interface RenderOptions {
  title: string
  theme: Theme
  /** Loads a message's picture; may fail, in which case a label is drawn instead. */
  image?: (m: ExportMsg) => Promise<ImageBitmap | null>
  progress?: (done: number, total: number) => void
  cancelled?: () => boolean
}

const day = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const LINE = 20
const HEAD = 22
const GAP = 12
const IMG_MAX = 360

/** Draw the messages as one or more canvases, oldest first. Each is a page of the export. */
export async function renderPages(msgs: readonly ExportMsg[], o: RenderOptions): Promise<HTMLCanvasElement[]> {
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = `14px ${FONT}`
  const measure = (s: string) => probe.measureText(s).width
  const textW = WIDTH - PAD * 2 - 24

  const blocks: Block[] = []
  let lastDay = ''
  for (let i = 0; i < msgs.length; i++) {
    if (o.cancelled?.()) return []
    const m = msgs[i]
    const d = day(m.ts)
    if (d !== lastDay) { blocks.push({ kind: 'day', label: d, h: 34 }); lastDay = d }
    const lines = bodyText(m) ? wrapText(m.emote ? `* ${m.senderName} ${bodyText(m)}` : bodyText(m), textW, measure) : []
    let img: ImageBitmap | undefined
    let imgW = 0
    let imgH = 0
    if (m.imageMxc && o.image) {
      img = (await o.image(m).catch(() => null)) ?? undefined
      if (img) { const k = Math.min(1, IMG_MAX / img.width, IMG_MAX / img.height); imgW = Math.round(img.width * k); imgH = Math.round(img.height * k) }
      else lines.push('🖼 Image (could not be loaded)')
    } else if (m.imageMxc) lines.push('🖼 Image')
    const reacts = Object.entries(m.reactions ?? {}).map(([k, n]) => `${k} ${n}`).join('   ')
    const h = HEAD + lines.length * LINE + (imgH ? imgH + 6 : 0) + (reacts ? LINE + 2 : 0) + GAP
    blocks.push({ kind: 'msg', m, lines, img, imgW, imgH, reacts, h })
    o.progress?.(i + 1, msgs.length)
  }

  const top = 64
  const pages = paginate(blocks.map((b) => b.h), MAX_PAGE - top - PAD)
  const t = o.theme
  return pages.map((idx, p) => {
    const content = idx.reduce((n, i) => n + blocks[i].h, 0)
    const c = document.createElement('canvas')
    c.width = WIDTH * SCALE
    c.height = Math.ceil((top + content + PAD) * SCALE)
    const x = c.getContext('2d')!
    x.scale(SCALE, SCALE)
    x.fillStyle = t.bg
    x.fillRect(0, 0, WIDTH, c.height / SCALE)
    x.textBaseline = 'alphabetic'
    x.fillStyle = t.text
    x.font = `600 17px ${FONT}`
    x.fillText(o.title, PAD, 30)
    x.fillStyle = t.muted
    x.font = `12px ${FONT}`
    x.fillText(`${msgs.length ? `${day(msgs[0].ts)} – ${day(msgs.at(-1)!.ts)}` : ''}${pages.length > 1 ? `  ·  page ${p + 1} of ${pages.length}` : ''}`, PAD, 50)
    x.strokeStyle = t.line
    x.beginPath(); x.moveTo(PAD, top - 4.5); x.lineTo(WIDTH - PAD, top - 4.5); x.stroke()
    let y = top
    for (const i of idx) {
      const b = blocks[i]
      if (b.kind === 'day') {
        x.fillStyle = t.muted
        x.font = `600 12px ${FONT}`
        x.textAlign = 'center'
        x.fillText(b.label, WIDTH / 2, y + 22)
        x.textAlign = 'left'
      } else {
        x.fillStyle = b.m.mine ? t.accent : t.text
        x.font = `600 14px ${FONT}`
        x.fillText(b.m.senderName, PAD, y + 15)
        const nameW = x.measureText(b.m.senderName).width
        x.fillStyle = t.muted
        x.font = `12px ${FONT}`
        x.fillText(time(b.m.ts), PAD + nameW + 8, y + 15)
        x.fillStyle = t.text
        x.font = `14px ${FONT}`
        let ly = y + HEAD
        for (const l of b.lines) { x.fillText(l, PAD + 24, ly + 14); ly += LINE }
        if (b.img) { x.drawImage(b.img, PAD + 24, ly + 2, b.imgW, b.imgH); ly += b.imgH + 6 }
        if (b.reacts) { x.fillStyle = t.muted; x.font = `13px ${FONT}`; x.fillText(b.reacts, PAD + 24, ly + 14) }
      }
      y += b.h
    }
    return c
  })
}

export const download = async (c: HTMLCanvasElement, name: string) => saveBlob(await canvasBlob(c, 'image/png'), name)

/** A CSV cell. Text that a spreadsheet would run as a formula (= + - @ at the start) is made inert with a leading apostrophe. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export interface CsvMsg extends ExportMsg { sender?: string }

/** The messages as CSV text (with a byte order mark, so Excel reads the UTF-8): time, sender, sender id, message, reactions. */
export function toCsv(msgs: readonly CsvMsg[]): string {
  const rows = [['Time (ISO 8601)', 'Sender', 'Sender ID', 'Message', 'Reactions']]
  for (const m of msgs) rows.push([new Date(m.ts).toISOString(), m.senderName, m.sender ?? '', m.imageMxc && !bodyText(m) ? '[image]' : bodyText(m), Object.entries(m.reactions ?? {}).map(([k, n]) => `${k} ${n}`).join(' ')])
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
