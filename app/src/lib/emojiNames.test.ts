import { describe, expect, it } from 'vitest'
import { EMOJI, emojiCode, findEmoji } from './emojiNames'

describe('findEmoji', () => {
  it('ranks names that start with the query before names that contain it', () => {
    const r = findEmoji('hea').map(([n]) => n)
    expect(r[0].startsWith('hea')).toBe(true)
    expect(r.indexOf('heart')).toBeLessThan(r.indexOf('sparkling_heart') === -1 ? 99 : r.indexOf('sparkling_heart'))
  })
  it('finds by a part of the name and respects the limit', () => {
    expect(findEmoji('eyes').some(([n]) => n === 'heart_eyes')).toBe(true)
    expect(findEmoji('a', 3)).toHaveLength(3)
  })
  it('has nothing for an empty or unknown query', () => {
    expect(findEmoji('')).toEqual([])
    expect(findEmoji('zzzzzz')).toEqual([])
  })
  it('has no duplicate shortcodes', () => {
    const names = EMOJI.map(([n]) => n)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('emojiCode', () => {
  it('gives the shortcode of an emoji, with or without the variation selector', () => {
    expect(emojiCode('😄')).toBe(':smile:')
    expect(emojiCode('❤')).toBe(emojiCode('❤️'))
  })
  it('is empty for an unknown emoji', () => expect(emojiCode('🦤🦤')).toBe(''))
  it('covers every emoji in the picker', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./EmojiPicker.svelte', import.meta.url), 'utf8')
    const all = [...src.matchAll(/\[\s*'\w+',\s*\[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
    expect(all.length).toBeGreaterThan(50)
    expect(all.filter((e) => !emojiCode(e))).toEqual([])
  })
})
