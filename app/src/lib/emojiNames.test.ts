import { describe, expect, it } from 'vitest'
import { EMOJI, findEmoji } from './emojiNames'

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
