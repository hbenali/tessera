// How the room list on the left looks, kept per browser. SDK-free and pure so it can be tested.
export type Rows = 'compact' | 'comfortable' | 'large'
export type AvatarSize = 'small' | 'normal' | 'large'
export type BadgeStyle = 'count' | 'dot'
export type SectionId = 'fav' | 'people' | 'rooms' | 'low'

export interface ListPrefs {
  /** Width in px (wide windows only). */
  width: number
  rows: Rows
  avatar: AvatarSize
  /** The last message under each room's name. */
  previews: boolean
  /** Group rooms under Favourites, People, Rooms and Low priority headings. */
  sections: boolean
  folded: SectionId[]
  /** A number for unread messages, or just a dot (a mention always shows its number). */
  badge: BadgeStyle
  /** The lock, star, mute and mention marks beside a room's name. */
  icons: boolean
  /** Only avatars, in a narrow strip. */
  rail: boolean
}

export const WIDTH = { min: 240, max: 480, dflt: 320, step: 16 }
export const RAIL_WIDTH = 68
export const AVATAR_PX: Record<AvatarSize, number> = { small: 30, normal: 38, large: 46 }
export const DEFAULTS: ListPrefs = { width: WIDTH.dflt, rows: 'comfortable', avatar: 'normal', previews: true, sections: false, folded: [], badge: 'count', icons: true, rail: false }
export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'fav', label: 'Favourites' },
  { id: 'people', label: 'People' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'low', label: 'Low priority' },
]
export const KEY = 'tessera.list'

export const clampWidth = (w: number): number => (Number.isFinite(w) ? Math.min(WIDTH.max, Math.max(WIDTH.min, Math.round(w))) : WIDTH.dflt)
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

/** Anything unknown, missing or out of range falls back to the default, so a newer or damaged value cannot break the list. */
export function parseListPrefs(raw: unknown): ListPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ids = SECTIONS.map((s) => s.id)
  return {
    width: typeof o.width === 'number' ? clampWidth(o.width) : DEFAULTS.width,
    rows: pick(o.rows, ['compact', 'comfortable', 'large'], DEFAULTS.rows),
    avatar: pick(o.avatar, ['small', 'normal', 'large'], DEFAULTS.avatar),
    previews: bool(o.previews, DEFAULTS.previews),
    sections: bool(o.sections, DEFAULTS.sections),
    folded: Array.isArray(o.folded) ? [...new Set(o.folded.filter((x): x is SectionId => ids.includes(x as SectionId)))] : [],
    badge: pick(o.badge, ['count', 'dot'], DEFAULTS.badge),
    icons: bool(o.icons, DEFAULTS.icons),
    rail: bool(o.rail, DEFAULTS.rail),
  }
}

// `localStorage` is looked up inside the try, so a missing or blocked storage (a test, a private window) gives the defaults.
export function readListPrefs(storage?: Pick<Storage, 'getItem'>): ListPrefs {
  try { return parseListPrefs(JSON.parse((storage ?? localStorage).getItem(KEY) ?? 'null')) } catch { return { ...DEFAULTS } }
}
export function writeListPrefs(p: ListPrefs, storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? localStorage).setItem(KEY, JSON.stringify(p)) } catch { /* storage may be full or blocked */ }
}

interface Groupable { favourite: boolean; isDM: boolean; lowPriority: boolean; unread: number; notifs?: string }
export interface Section<T> { id: SectionId; label: string; items: T[]; unread: number; folded: boolean }

/** Which heading a room sits under: low priority wins over favourite, which wins over being a direct chat. */
export const sectionOf = (r: Groupable): SectionId => (r.lowPriority ? 'low' : r.favourite ? 'fav' : r.isDM ? 'people' : 'rooms')

/** The rooms (already in the order the list shows) under their headings; a heading with no room is left out. A folded heading keeps its rooms but reports their unread count. */
export function groupRooms<T extends Groupable>(rooms: readonly T[], folded: readonly SectionId[]): Section<T>[] {
  const out: Section<T>[] = []
  for (const s of SECTIONS) {
    const items = rooms.filter((r) => sectionOf(r) === s.id)
    if (items.length) out.push({ id: s.id, label: s.label, items, unread: items.reduce((n, r) => n + (r.notifs === 'mute' ? 0 : r.unread), 0), folded: folded.includes(s.id) })
  }
  return out
}
