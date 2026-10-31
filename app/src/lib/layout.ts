// Message layouts ("room themes"): how a room's messages are drawn. SDK-free.
export type Layout = 'classic' | 'aligned' | 'cards' | 'lines'

/** Room accents. Each reads at 4.5:1 or better with white text on it (a test keeps that true). */
export const ACCENTS: { id: string; label: string; color: string }[] = [
  { id: 'blue', label: 'Blue', color: '#2b5ae5' },
  { id: 'violet', label: 'Violet', color: '#7a4de0' },
  { id: 'teal', label: 'Teal', color: '#0b7a72' },
  { id: 'green', label: 'Green', color: '#237a40' },
  { id: 'amber', label: 'Amber', color: '#a35c00' },
  { id: 'rose', label: 'Rose', color: '#c2306a' },
  { id: 'red', label: 'Red', color: '#bf362c' },
  { id: 'slate', label: 'Slate', color: '#4a5568' },
]
export const accentColor = (id: string | undefined): string | undefined => ACCENTS.find((a) => a.id === id)?.color

/** A room's own theme as kept in its account data. Unknown values are dropped, so a newer client cannot break an older one. */
export interface RoomTheme { layout?: Layout; accent?: string }
export function parseRoomTheme(content: unknown): RoomTheme {
  const c = (content ?? {}) as Record<string, unknown>
  return { layout: isLayout(c.layout) ? c.layout : undefined, accent: typeof c.accent === 'string' && ACCENTS.some((a) => a.id === c.accent) ? c.accent : undefined }
}
/** The content to store after a change: a field set to undefined is removed. */
export const mergeRoomTheme = (cur: RoomTheme, patch: { layout?: Layout | null; accent?: string | null }): Record<string, string> => {
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? undefined])) } as RoomTheme
  return Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Record<string, string>
}

export const LAYOUTS: { id: Layout; label: string; hint: string }[] = [
  { id: 'classic', label: 'Classic', hint: 'Avatar and name on the left, text underneath' },
  { id: 'aligned', label: 'Aligned', hint: 'Your messages on the right, everyone else on the left, in bubbles' },
  { id: 'cards', label: 'Cards', hint: 'Each message in its own card' },
  { id: 'lines', label: 'Lines', hint: 'One tight line per message, like IRC' },
]

export const isLayout = (v: unknown): v is Layout => LAYOUTS.some((l) => l.id === v)

/** Saved per-room choices; anything that is not a known layout for a string room id is dropped. */
export function parseOverrides(raw: string | null): Record<string, Layout> {
  try {
    const v = JSON.parse(raw ?? '{}')
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v).filter(([k, l]) => typeof k === 'string' && isLayout(l))) as Record<string, Layout>
  } catch {
    return {}
  }
}

/** The room's own choice if it has one, else the default. */
export const effectiveLayout = (dflt: Layout, overrides: Record<string, Layout>, room: string | null | undefined): Layout => (room && overrides[room]) || dflt

/** A new set of overrides with one room set, or cleared when `layout` is undefined. Never mutates the input. */
export function withOverride(overrides: Record<string, Layout>, room: string, layout: Layout | undefined): Record<string, Layout> {
  const next = { ...overrides }
  if (layout) next[room] = layout
  else delete next[room]
  return next
}
