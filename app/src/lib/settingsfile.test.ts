import { describe as suite, expect, it } from 'vitest'
import { LANGUAGES } from './i18n.svelte'
import { DEFAULTS } from './listprefs'
import { LANGUAGE_IDS, MAX_BYTES, SETTING_KEYS, THEME_IDS, VERSION, describe, fileName, parseSettingsFile, sanitize, serialize } from './settingsfile'
import { THEMES } from './ui.svelte'

const file = (settings: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ format: 'tessera-settings', version: 1, settings, ...extra })

suite('the allowed values match the app', () => {
  it('themes', () => expect([...THEME_IDS]).toEqual(THEMES.map((t) => t.id)))
  it('languages', () => expect([...LANGUAGE_IDS]).toEqual(LANGUAGES.map((l) => l.id)))
})

suite('sanitize', () => {
  it('keeps valid settings', () => {
    const s = { theme: 'sand', layout: 'cards', density: 'compact', textSize: 'large', showMembership: true, language: 'fr', roomOrder: 'name', listHidden: true, sound: false, soundStyle: 'pop', searchAdvanced: true }
    expect(sanitize(s)).toEqual({ settings: s, ignored: [] })
  })
  it('drops a wrong value but keeps the others, naming only the setting', () => {
    const r = sanitize({ theme: 'neon', density: 'compact', sound: 'yes' })
    expect(r.settings).toEqual({ density: 'compact' })
    expect(r.ignored).toEqual(['theme', 'sound'])
  })
  it('tidies the list display like the app does', () => {
    const r = sanitize({ list: { width: 9999, rows: 'tiny', rail: true, folded: ['fav', 'x'] } })
    expect(r.settings.list).toMatchObject({ width: 480, rows: 'comfortable', rail: true, folded: ['fav'] })
    expect(sanitize({ list: 'wide' }).settings.list).toBeUndefined()
    expect(sanitize({ list: [] }).settings.list).toBeUndefined()
  })
  it('never copies a setting it does not know, such as a session or an account', () => {
    const r = sanitize({ theme: 'dark', 'tessera.session': { accessToken: 'stolen', baseUrl: 'https://evil.example' }, accounts: ['x'], session: 'x', __proto__: { polluted: true }, constructor: 'x' })
    expect(r.settings).toEqual({ theme: 'dark' })
    expect(Object.keys(r.settings)).toEqual(['theme'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain('stolen')
    expect(JSON.stringify(r)).not.toContain('evil.example')
  })
  it('copes with something that is not an object', () => { for (const v of [null, undefined, 'x', 3, []]) expect(sanitize(v)).toEqual({ settings: {}, ignored: [] }) })
})

suite('the file', () => {
  it('round-trips every setting', () => {
    const all = { theme: 'ocean', layout: 'aligned', density: 'compact', textSize: 'small', showMembership: true, language: 'de', roomOrder: 'unread', list: { ...DEFAULTS, width: 400, rail: true }, listHidden: true, sound: false, soundStyle: 'blip', searchAdvanced: true } as const
    expect(Object.keys(all).sort()).toEqual([...SETTING_KEYS].sort())
    const r = parseSettingsFile(serialize(all, new Date('2026-11-10T12:00:00Z'), 'Tessera 1.2.0'))
    expect(r).toMatchObject({ ok: true, ignored: [], newer: false })
    if (r.ok) expect(r.settings).toEqual(all)
  })
  it('says what it is and when it was made, and holds nothing but settings', () => {
    const j = JSON.parse(serialize({ theme: 'dark' }, new Date('2026-11-10T12:00:00Z')))
    expect(j).toEqual({ format: 'tessera-settings', version: VERSION, exportedAt: '2026-11-10T12:00:00.000Z', settings: { theme: 'dark' } })
  })
  it('does not write an unknown setting even when asked to', () => expect(JSON.parse(serialize({ theme: 'dark', token: 'x' } as never)).settings).toEqual({ theme: 'dark' }))
  it('refuses what is not a settings file', () => {
    for (const t of ['{oops', '[]', 'null', '"x"', JSON.stringify({ format: 'other', version: 1, settings: { theme: 'dark' } }), JSON.stringify({ settings: { theme: 'dark' } })]) expect(parseSettingsFile(t).ok).toBe(false)
  })
  it('refuses a file without a version, or with nothing usable', () => {
    expect(parseSettingsFile(JSON.stringify({ format: 'tessera-settings', settings: { theme: 'dark' } })).ok).toBe(false)
    expect(parseSettingsFile(file({ theme: 'neon' })).ok).toBe(false)
    expect(parseSettingsFile(file({})).ok).toBe(false)
  })
  it('refuses a huge file', () => expect(parseSettingsFile(file({ theme: 'dark' }, { pad: 'x'.repeat(MAX_BYTES) })).ok).toBe(false))
  it('accepts a file from a newer version for what it knows, and says so', () => {
    const r = parseSettingsFile(JSON.stringify({ format: 'tessera-settings', version: VERSION + 1, settings: { theme: 'dark', hologram: true } }))
    expect(r).toMatchObject({ ok: true, newer: true, ignored: ['hologram'], settings: { theme: 'dark' } })
  })
})

suite('describe and fileName', () => {
  it('lists what would change, in a fixed order', () => {
    expect(describe({ sound: false, theme: 'sand' }).map((d) => [d.label, d.value])).toEqual([['Theme', 'sand'], ['Message sound', 'off']])
  })
  it('names the file by date', () => expect(fileName(new Date(2026, 10, 9))).toBe('tessera-settings-2026-11-09.json'))
})
