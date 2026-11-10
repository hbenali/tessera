// Export and import of this browser's own settings as a small JSON file. Pure: nothing here touches storage or the page.
//
// Only a fixed list of settings is ever read from a file, each one checked against what the app allows. Anything else in
// the file (a session, an account, a made-up key) is ignored and never copied, so a file cannot change who you are signed
// in as or reach anything but the look and behaviour listed here. Accounts, keys, drafts and messages are never written out.
import { isLayout, type Layout } from './layout'
import { parseListPrefs, type ListPrefs } from './listprefs'

export const FORMAT = 'tessera-settings'
export const VERSION = 1
export const MAX_BYTES = 64 * 1024

export const THEME_IDS = ['auto', 'dark', 'light', 'midnight', 'sand', 'forest', 'ocean', 'contrast'] as const
export const LANGUAGE_IDS = ['en', 'fr', 'es', 'de'] as const
export const SOUND_STYLES = ['chime', 'blip', 'pop'] as const
export const ROOM_ORDERS = ['activity', 'unread', 'name'] as const

export interface Portable {
  theme: (typeof THEME_IDS)[number]
  layout: Layout
  density: 'comfortable' | 'compact'
  textSize: 'small' | 'normal' | 'large'
  showMembership: boolean
  language: (typeof LANGUAGE_IDS)[number]
  roomOrder: (typeof ROOM_ORDERS)[number]
  list: ListPrefs
  listHidden: boolean
  sound: boolean
  soundStyle: (typeof SOUND_STYLES)[number]
  searchAdvanced: boolean
}
export type Settings = Partial<Portable>

const oneOf = <T extends string>(list: readonly T[]) => (v: unknown): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined)
const flag = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

/** How to check each setting: a value that passes is kept as it is (or tidied), anything else is dropped. */
const CHECK: { [K in keyof Portable]: (v: unknown) => Portable[K] | undefined } = {
  theme: oneOf(THEME_IDS),
  layout: (v) => (isLayout(v) ? v : undefined),
  density: oneOf(['comfortable', 'compact'] as const),
  textSize: oneOf(['small', 'normal', 'large'] as const),
  showMembership: flag,
  language: oneOf(LANGUAGE_IDS),
  roomOrder: oneOf(ROOM_ORDERS),
  list: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? parseListPrefs(v) : undefined),
  listHidden: flag,
  sound: flag,
  soundStyle: oneOf(SOUND_STYLES),
  searchAdvanced: flag,
}
export const SETTING_KEYS = Object.keys(CHECK) as (keyof Portable)[]

export const LABELS: Record<keyof Portable, string> = {
  theme: 'Theme', layout: 'Default room layout', density: 'Message density', textSize: 'Text size', showMembership: 'Joins, leaves and name changes',
  language: 'Language', roomOrder: 'Room order', list: 'Room list display', listHidden: 'Room list hidden', sound: 'Message sound', soundStyle: 'Sound style', searchAdvanced: 'Advanced search',
}

/** Keep the settings we know, valid ones only. `ignored` names what was left out (names only, never values). */
export function sanitize(raw: unknown): { settings: Settings; ignored: string[] } {
  const settings: Settings = {}
  const ignored: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { settings, ignored }
  const o = raw as Record<string, unknown>
  for (const k of Object.keys(o)) {
    if (!Object.hasOwn(CHECK, k)) { if (ignored.length < 20) ignored.push(k.slice(0, 40)); continue }
    const key = k as keyof Portable
    const v = CHECK[key](o[k])
    if (v === undefined) { if (ignored.length < 20) ignored.push(key); continue }
    ;(settings as Record<string, unknown>)[key] = v
  }
  return { settings, ignored }
}

/** The file's text. */
export function serialize(settings: Settings, now: Date = new Date(), app = ''): string {
  const clean = sanitize(settings).settings
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: now.toISOString(), ...(app ? { app } : {}), settings: clean }, null, 2) + '\n'
}

export type Parsed = { ok: true; settings: Settings; ignored: string[]; newer: boolean } | { ok: false; error: string }

export function parseSettingsFile(text: string): Parsed {
  if (text.length > MAX_BYTES) return { ok: false, error: 'This file is too large to be a Tessera settings file.' }
  let json: unknown
  try { json = JSON.parse(text) } catch { return { ok: false, error: 'This is not a settings file (it is not valid JSON).' } }
  if (!json || typeof json !== 'object' || (json as { format?: unknown }).format !== FORMAT) return { ok: false, error: 'This is not a Tessera settings file.' }
  const v = (json as { version?: unknown }).version
  const inner = (json as { settings?: unknown }).settings
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, error: 'This settings file has no valid version.' }
  const { settings, ignored } = sanitize(inner)
  if (!Object.keys(settings).length) return { ok: false, error: 'This file has no settings that Tessera can use.' }
  return { ok: true, settings, ignored, newer: v > VERSION }
}

const nice = (k: keyof Portable, v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  if (k === 'list') { const l = v as ListPrefs; return `${l.width}px, ${l.rows} rows${l.rail ? ', icons only' : ''}${l.sections ? ', headings' : ''}` }
  return String(v)
}
/** What applying would set, for showing before it is done. */
export const describe = (s: Settings): { key: keyof Portable; label: string; value: string }[] =>
  SETTING_KEYS.filter((k) => s[k] !== undefined).map((k) => ({ key: k, label: LABELS[k], value: nice(k, s[k]) }))

export const fileName = (d: Date = new Date()) => `tessera-settings-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`
