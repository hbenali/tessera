import { describe, expect, it } from 'vitest'
import { ACCENTS, LAYOUTS, accentColor, effectiveLayout, isLayout, mergeRoomTheme, parseOverrides, parseRoomTheme, withOverride } from './layout'

describe('layouts', () => {
  it('knows its layouts', () => { expect(LAYOUTS.map((l) => l.id)).toEqual(['classic', 'aligned', 'cards', 'lines']); expect(isLayout('cards')).toBe(true); expect(isLayout('nope')).toBe(false); expect(isLayout(undefined)).toBe(false) })
  it('keeps only valid saved choices', () => {
    expect(parseOverrides('{"!a:x":"cards","!b:x":"weird","!c:x":3}')).toEqual({ '!a:x': 'cards' })
    expect(parseOverrides('not json')).toEqual({})
    expect(parseOverrides('[1,2]')).toEqual({})
    expect(parseOverrides(null)).toEqual({})
  })
  it('a room\'s own choice beats the default', () => {
    expect(effectiveLayout('classic', { '!a:x': 'lines' }, '!a:x')).toBe('lines')
    expect(effectiveLayout('aligned', { '!a:x': 'lines' }, '!b:x')).toBe('aligned')
    expect(effectiveLayout('aligned', {}, null)).toBe('aligned')
  })
  it('sets and clears without touching the original', () => {
    const base = { '!a:x': 'cards' as const }
    expect(withOverride(base, '!b:x', 'lines')).toEqual({ '!a:x': 'cards', '!b:x': 'lines' })
    expect(withOverride(base, '!a:x', undefined)).toEqual({})
    expect(base).toEqual({ '!a:x': 'cards' })
  })
})

const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
describe('accents', () => {
  it('every accent carries white text at 4.5:1 or better', () => {
    for (const a of ACCENTS) expect(1.05 / (lum(a.color) + 0.05), a.label).toBeGreaterThanOrEqual(4.5)
  })
  it('finds a colour by id', () => { expect(accentColor('rose')).toBe('#c2306a'); expect(accentColor('nope')).toBeUndefined(); expect(accentColor(undefined)).toBeUndefined() })
})
describe('room theme data', () => {
  it('keeps only known values', () => {
    expect(parseRoomTheme({ layout: 'cards', accent: 'teal', extra: 1 })).toEqual({ layout: 'cards', accent: 'teal' })
    expect(parseRoomTheme({ layout: 'future', accent: 'neon' })).toEqual({ layout: undefined, accent: undefined })
    expect(parseRoomTheme(null)).toEqual({ layout: undefined, accent: undefined })
  })
  it('merges a change and removes what is set to null', () => {
    expect(mergeRoomTheme({ layout: 'cards' }, { accent: 'red' })).toEqual({ layout: 'cards', accent: 'red' })
    expect(mergeRoomTheme({ layout: 'cards', accent: 'red' }, { layout: null })).toEqual({ accent: 'red' })
    expect(mergeRoomTheme({}, { layout: null, accent: null })).toEqual({})
  })
})
