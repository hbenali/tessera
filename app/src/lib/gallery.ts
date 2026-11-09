// The "Shared media" of a room: its pictures, files and links, newest first, grouped by month. Pure.
export type GalleryKind = 'media' | 'files' | 'links'

export interface GalleryMsg {
  id: string
  ts: number
  body: string
  pending?: boolean
  undecryptable?: boolean
  sticker?: boolean
  imageMxc?: string
  attachment?: unknown
  audio?: unknown
  poll?: unknown
  location?: unknown
}

export interface Group<T> { key: string; label: string; items: T[] }
export interface LinkItem<M> { id: string; url: string; msg: M }

const URL_RE = /https?:\/\/[^\s<>]+[^\s<>.,;:!?)'"\]]/g

/** The web links in a text, in order, without repeats. */
export const linksOf = (body: string): string[] => [...new Set(body.match(URL_RE) ?? [])]

/** Pictures (stickers are not shared media), or files and voice messages, of the loaded messages, newest first. */
export function galleryMessages<M extends GalleryMsg>(msgs: readonly M[], kind: 'media' | 'files'): M[] {
  const keep = (m: M) => !m.pending && !m.undecryptable && (kind === 'media' ? !!m.imageMxc && !m.sticker : !!m.attachment || !!m.audio)
  return msgs.filter(keep).reverse()
}

/** Every link in the loaded messages, newest message first (a caption on a file counts, a poll or a place does not). */
export function galleryLinks<M extends GalleryMsg>(msgs: readonly M[]): LinkItem<M>[] {
  const out: LinkItem<M>[] = []
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.pending || m.undecryptable || m.poll || m.location || m.imageMxc) continue
    const text = m.attachment ? ((m.attachment as { caption?: string }).caption ?? '') : m.body
    linksOf(text).forEach((url, n) => out.push({ id: `${m.id}#${n}`, url, msg: m }))
  }
  return out
}

/** Group items (already newest first) under their month, in the order they come. */
export function monthGroups<T>(items: readonly T[], ts: (t: T) => number, label: (d: Date) => string): Group<T>[] {
  const groups: Group<T>[] = []
  for (const it of items) {
    const d = new Date(ts(it))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const last = groups.at(-1)
    if (last?.key === key) last.items.push(it)
    else groups.push({ key, label: label(d), items: [it] })
  }
  return groups
}

export const monthLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

/** The site of a link, for showing it: "example.com" rather than the whole address. */
export function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return url }
}
