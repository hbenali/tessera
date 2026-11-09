// Draws a conversation as pictures that look like the chat itself: the room header, round avatar tiles, grouped senders,
// reply lines, reaction chips, mention pills, code blocks and the room's own layout (classic, aligned, cards or lines).
// Reads only; sends nothing. The geometry follows the timeline's CSS (Timeline.svelte).
import { FONT, MAX_PAGE, MONO, SCALE, WIDTH, messageRuns, mix, paginate, type ExportMsg, type Theme } from './export'
import { flowRuns, PRE_PAD, QUOTE_INDENT, type RLine, type Run } from './richtext'
import type { Layout } from './layout'
import { initials, tone } from './ui.svelte'

export interface DrawOptions {
  title: string
  subtitle?: string
  encrypted?: boolean
  isDM?: boolean
  roomAvatar?: ImageBitmap | null
  layout: Layout
  theme: Theme
  /** Print the Markdown source instead of the formatted message. */
  source?: boolean
  image?: (m: ExportMsg) => Promise<ImageBitmap | null>
  avatar?: (mxc: string) => Promise<ImageBitmap | null>
  progress?: (done: number, total: number) => void
  cancelled?: () => boolean
}

const LINE = 21
const HEAD = 22
const TOP = 56
const AV = 36
const IMG_MAX = 360
const day = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const fontOf = (r: Run) => `${r.italic ? 'italic ' : ''}${r.bold || r.mention ? '600 ' : ''}${r.code || r.pre ? `12.5px ${MONO}` : r.dim ? `11px ${FONT}` : `14px ${FONT}`}`

type Item =
  | { kind: 'day'; label: string; h: number }
  | { kind: 'msg'; m: ExportMsg; cont: boolean; lines: RLine[]; ys: number[]; textH: number; tw: number; bubbleW: number; textX: number; nameW: number; img?: ImageBitmap; imgW: number; imgH: number; av?: ImageBitmap | null; h: number }

/** Vertical positions of text lines: a code block gets room above and below. */
function vlayout(lines: readonly RLine[]) {
  const ys: number[] = []
  let y = 0
  lines.forEach((l, i) => {
    if (l.pre && !lines[i - 1]?.pre) y += 10
    ys.push(y)
    y += LINE
    if (l.pre && !lines[i + 1]?.pre) y += 10
  })
  return { ys, total: y }
}

export async function renderPages(msgs: readonly ExportMsg[], o: DrawOptions): Promise<HTMLCanvasElement[]> {
  const t = o.theme
  const L = o.layout
  const pc = document.createElement('canvas').getContext('2d')!
  const runW = (r: Run) => { pc.font = fontOf(r); return pc.measureText(r.text).width + (r.code ? 10 : 0) + (r.mention ? 23 : 0) }
  const textW = (font: string, s: string) => { pc.font = font; return pc.measureText(s).width }
  const fit = (s: string, max: number, font: string) => { if (textW(font, s) <= max) return s; let n = s.length; while (n > 1 && textW(font, s.slice(0, n) + '…') > max) n--; return s.slice(0, n) + '…' }

  const avatars = new Map<string, Promise<ImageBitmap | null>>()
  const items: Item[] = []
  let prev: ExportMsg | undefined
  for (let i = 0; i < msgs.length; i++) {
    if (o.cancelled?.()) return []
    const m = msgs[i]
    const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString()
    if (newDay) items.push({ kind: 'day', label: day(m.ts), h: 44 })
    const cont = !newDay && !!prev && prev.sender === m.sender && m.ts - prev.ts < 300_000 && !m.reply
    prev = m
    const mine = !!m.mine
    // The width the text may use, which depends on the layout.
    const nameW = L === 'lines' ? Math.min(150, textW(`600 14px ${FONT}`, m.senderName)) : 0
    const textX = L === 'classic' ? 20 + AV + 12 : L === 'cards' ? 12 + 14 + AV + 12 : L === 'aligned' ? (mine ? 0 : 16 + AV + 12) : 16 + 66 + 8 + nameW + 8
    const tw = L === 'classic' ? WIDTH - 20 - textX : L === 'cards' ? WIDTH - 26 - textX : L === 'aligned' ? 525 - 24 : WIDTH - 16 - textX
    const lines = flowRuns(messageRuns(m, o.source), tw, runW)
    const note = (s: string) => lines.push({ runs: [{ text: s, italic: true }] })
    let img: ImageBitmap | undefined
    let imgW = 0
    let imgH = 0
    if (m.imageMxc && o.image) {
      img = (await o.image(m).catch(() => null)) ?? undefined
      if (img) { const k = Math.min(1, IMG_MAX / img.width, IMG_MAX / img.height); imgW = Math.round(img.width * k); imgH = Math.round(img.height * k) }
      else note('🖼 Image (could not be loaded)')
    } else if (m.imageMxc) note('🖼 Image')
    let av: ImageBitmap | null | undefined
    if (!cont && m.senderAvatar && o.avatar && L !== 'lines' && !(L === 'aligned' && mine)) {
      if (!avatars.has(m.senderAvatar)) avatars.set(m.senderAvatar, o.avatar(m.senderAvatar).catch(() => null))
      av = await avatars.get(m.senderAvatar)
    }
    const { ys, total } = vlayout(lines)
    let widest = 0
    for (const l of lines) widest = Math.max(widest, l.runs.reduce((n, r) => n + runW(r), 0) + (l.pre ? PRE_PAD * 2 : 0) + (l.quote ? QUOTE_INDENT : 0))
    const bubbleW = Math.min(525, Math.ceil(widest) + 24)
    const showHead = L === 'lines' ? false : !cont
    const bubble = L === 'aligned' && lines.length > 0
    const inner = (showHead ? HEAD : 0) + (m.reply ? 23 : 0) + total + (bubble ? 14 : 0) + (imgH ? imgH + 6 : 0) + (Object.keys(m.reactions ?? {}).length ? 29 : 0)
    const min = !cont && L !== 'lines' && !(L === 'aligned' && mine) ? AV + 2 : 0
    const h = L === 'cards' ? 8 + 20 + Math.max(inner, min) : (cont ? 0 : 10) + 4 + Math.max(inner, min, L === 'lines' ? LINE : 0)
    items.push({ kind: 'msg', m, cont, lines, ys, textH: total, tw, bubbleW, textX, nameW, img, imgW, imgH, av, h })
    o.progress?.(i + 1, msgs.length)
  }

  const pages = paginate(items.map((b) => b.h), MAX_PAGE - TOP - 16)
  const range = msgs.length ? `${day(msgs[0].ts)} – ${day(msgs.at(-1)!.ts)}` : ''
  return pages.map((idx, p) => {
    const content = idx.reduce((n, i) => n + items[i].h, 0)
    const c = document.createElement('canvas')
    c.width = WIDTH * SCALE
    c.height = Math.ceil((TOP + content + 16) * SCALE)
    const x = c.getContext('2d')!
    x.scale(SCALE, SCALE)
    x.textBaseline = 'alphabetic'
    x.fillStyle = t.bg
    x.fillRect(0, 0, WIDTH, c.height / SCALE)

    const rr = (px: number, py: number, w: number, h: number, r: number | number[]) => { x.beginPath(); x.roundRect(px, py, w, h, r) }
    const text = (s: string, px: number, py: number, font: string, color: string, align: CanvasTextAlign = 'left') => { x.font = font; x.fillStyle = color; x.textAlign = align; x.fillText(s, px, py); x.textAlign = 'left' }
    const avatar = (px: number, py: number, name: string, bmp?: ImageBitmap | null, size = AV, round = true) => {
      x.save()
      rr(px, py, size, size, round ? size / 2 : size * 0.3)
      x.clip()
      if (bmp) x.drawImage(bmp, px, py, size, size)
      else { x.fillStyle = t.tones[tone(name)] ?? t.tones[0]; x.fillRect(px, py, size, size); text(initials(name), px + size / 2, py + size / 2 + size * 0.14, `700 ${size * 0.38}px ${FONT}`, t.ink, 'center') }
      x.restore()
    }

    // The room header, like the one above the timeline.
    x.fillStyle = t.bg
    avatar(16, 12, o.title, o.roomAvatar, 32, !!o.isDM)
    text(fit(o.title, 440, `650 16px ${FONT}`), 60, 27, `650 16px ${FONT}`, t.text)
    text(fit([o.subtitle, range, pages.length > 1 ? `page ${p + 1} of ${pages.length}` : ''].filter(Boolean).join(' · '), 470, `12px ${FONT}`), 60, 44, `12px ${FONT}`, t.muted)
    if (o.encrypted) {
      const label = '🔒 Encrypted'
      const w = textW(`12px ${FONT}`, label) + 18
      rr(WIDTH - 16 - w, 19, w, 22, 11); x.fillStyle = mix(t.ok, t.bg, 14); x.fill()
      text(label, WIDTH - 16 - w + 9, 34, `12px ${FONT}`, t.ok)
    }
    x.fillStyle = t.line
    x.fillRect(0, TOP - 1, WIDTH, 1)

    const drawRuns = (l: RLine, left: number, top: number) => {
      let at = left + (l.quote ? QUOTE_INDENT : 0) + (l.pre ? PRE_PAD : 0)
      if (l.quote) { x.fillStyle = t.line; x.fillRect(left, top, 3, LINE) }
      for (const r of l.runs) {
        x.font = fontOf(r)
        const w = runW(r)
        let tx = at
        let color = t.text
        if (r.code) { rr(at, top + 2, w, LINE - 4, 4); x.fillStyle = t.tile; x.fill(); tx = at + 5 }
        if (r.mention) {
          rr(at, top + 1, w, LINE - 2, 5); x.fillStyle = r.me ? t.accent : mix(t.accent, t.bg, 16); x.fill()
          x.beginPath(); x.arc(at + 9, top + LINE / 2, 4, 0, Math.PI * 2); x.fillStyle = t.tones[tone(r.text.replace(/^@/, ''))] ?? t.tones[0]; x.fill()
          tx = at + 18
          color = r.me ? t.accentInk : mix(t.accent, t.text, 55)
        } else if (r.link) color = t.accent
        else if (r.quote || r.dim) color = t.muted
        x.fillStyle = color
        x.font = fontOf(r)
        x.fillText(r.text, tx, top + 15)
        const tw2 = x.measureText(r.text).width
        if (r.link) x.fillRect(tx, top + 17.5, tw2, 1)
        if (r.strike) x.fillRect(tx, top + 10, tw2, 1)
        at += w
      }
    }

    let y = TOP + 4
    for (const i of idx) {
      const b = items[i]
      if (b.kind === 'day') {
        const w = textW(`600 12px ${FONT}`, b.label)
        x.fillStyle = t.line
        x.fillRect(20, y + 28, WIDTH / 2 - w / 2 - 12 - 20, 1)
        x.fillRect(WIDTH / 2 + w / 2 + 12, y + 28, WIDTH / 2 - w / 2 - 12 - 20, 1)
        text(b.label, WIDTH / 2, y + 32, `600 12px ${FONT}`, t.muted, 'center')
        y += b.h
        continue
      }
      const { m, cont } = b
      const mine = !!m.mine
      const top0 = y + (L === 'cards' ? 8 : cont ? 0 : 10)
      const right = L === 'cards' ? WIDTH - 26 : WIDTH - (L === 'aligned' ? 16 : 20)
      let by = top0 + 2 // the body's first line
      let bx = b.textX
      if (L === 'cards') {
        rr(12.5, top0 + 0.5, WIDTH - 25, b.h - 8 - 1, 12)
        x.fillStyle = mine ? mix(t.accent, t.panel, 6) : t.panel; x.fill()
        x.strokeStyle = mine ? mix(t.accent, t.line, 40) : t.line; x.lineWidth = 1; x.stroke()
        by = top0 + 10
      } else if (m.mentionsMe) {
        x.fillStyle = mix(t.accent, t.bg, 10); x.fillRect(0, top0 - 2, WIDTH, b.h - (cont ? 0 : 10))
        x.fillStyle = t.accent; x.fillRect(0, top0 - 2, 3, b.h - (cont ? 0 : 10))
      }
      const rightAlign = L === 'aligned' && mine
      const drawReply = () => {
        const rx = L === 'lines' ? 16 : bx
        x.fillStyle = t.accent; x.fillRect(rx + (rightAlign ? 0 : 0), by + 2, 2, 18)
        const rp = m.reply!
        const lead = `↩\uFE0E ${rp.name} `
        x.font = `600 12px ${FONT}`
        const lw = x.measureText(lead).width
        text(lead, rx + 10, by + 15, `600 12px ${FONT}`, t.muted)
        text(fit(rp.text, 440 - lw, `12px ${FONT}`), rx + 10 + lw, by + 15, `12px ${FONT}`, t.muted)
        by += 23
      }
      if (L === 'lines') {
        if (m.reply) drawReply()
        text(time(m.ts), 16, by + 14, `11px ${MONO}`, t.muted)
        text(fit(m.senderName, 150, `600 14px ${FONT}`), 16 + 66, by + 15, `600 14px ${FONT}`, t.text)
      } else {
        if (!cont && !(L === 'aligned' && mine)) avatar(L === 'cards' ? 12 + 14 : L === 'aligned' ? 16 : 20, by, m.senderName, b.av)
        if (!cont) {
          const nameFont = `650 14px ${FONT}`
          const nw = textW(nameFont, m.senderName)
          const tmw = textW(`11px ${FONT}`, time(m.ts))
          const hx = L === 'aligned' && mine ? right - nw - 8 - tmw : bx
          text(fit(m.senderName, 380, nameFont), hx, by + 15, nameFont, t.text)
          text(time(m.ts), hx + Math.min(nw, 380) + 8, by + 15, `11px ${FONT}`, t.muted)
          by += HEAD
        }
      }
      if (rightAlign) bx = right - b.bubbleW
      // The reply line, then the text (in a bubble for the aligned layout), the picture, and the reactions.
      if (m.reply && L !== 'lines') drawReply()
      if (b.lines.length) {
        if (L === 'aligned') {
          const r = mine ? [16, 16, 5, 16] : cont ? 16 : [16, 16, 16, 5]
          rr(bx, by, b.bubbleW, b.textH + 14, r); x.fillStyle = mine ? mix(t.accent, t.bg, 20) : t.tile; x.fill()
          by += 7
        }
        const tx = L === 'aligned' ? bx + 12 : bx
        let i2 = 0
        while (i2 < b.lines.length) {
          const l = b.lines[i2]
          if (l.pre && !b.lines[i2 - 1]?.pre) {
            let j = i2
            while (b.lines[j + 1]?.pre) j++
            rr(tx + 0.5, by + b.ys[i2] - 10 + 0.5, (L === 'aligned' ? b.bubbleW - 24 : b.tw) - 1, b.ys[j] + LINE - b.ys[i2] + 20 - 1, 8)
            x.fillStyle = t.panel; x.fill(); x.strokeStyle = t.line; x.lineWidth = 1; x.stroke()
          }
          drawRuns(l, tx, by + b.ys[i2])
          i2++
        }
        by += b.textH + (L === 'aligned' ? 7 : 0)
      }
      if (b.img) { x.drawImage(b.img, rightAlign ? right - b.imgW : bx, by + 2, b.imgW, b.imgH); by += b.imgH + 6 }
      const chips = Object.entries(m.reactions ?? {})
      if (chips.length) {
        const widths = chips.map(([k, n]) => 18 + textW(`14px ${FONT}`, k) + 5 + textW(`600 12px ${FONT}`, String(n)))
        let cx = rightAlign ? right - widths.reduce((a, w) => a + w + 6, -6) : L === 'lines' ? 16 : bx
        chips.forEach(([k, n], j) => {
          rr(cx + 0.5, by + 5.5, widths[j] - 1, 23, 12); x.fillStyle = t.tile; x.fill(); x.strokeStyle = t.line; x.lineWidth = 1; x.stroke()
          text(k, cx + 9, by + 22, `14px ${FONT}`, t.text)
          text(String(n), cx + 9 + textW(`14px ${FONT}`, k) + 5, by + 21, `600 12px ${FONT}`, t.text)
          cx += widths[j] + 6
        })
      }
      y += b.h
    }
    return c
  })
}
