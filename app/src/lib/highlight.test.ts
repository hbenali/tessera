import { describe, expect, it } from 'vitest'
import { highlight } from './highlight'

describe('highlight', () => {
  it('marks every match, ignoring case, and keeps the original text', () => {
    expect(highlight('Lunch at noon? lunch!', 'LUNCH')).toEqual([
      { text: 'Lunch', hit: true },
      { text: ' at noon? ', hit: false },
      { text: 'lunch', hit: true },
      { text: '!', hit: false },
    ])
  })
  it('returns the text untouched for an empty or missing term', () => {
    expect(highlight('hello', '')).toEqual([{ text: 'hello', hit: false }])
    expect(highlight('hello', 'xyz')).toEqual([{ text: 'hello', hit: false }])
  })
  it('does not treat the term as markup or a pattern', () => {
    expect(highlight('a <b> (c)', '<b>')).toEqual([{ text: 'a ', hit: false }, { text: '<b>', hit: true }, { text: ' (c)', hit: false }])
    expect(highlight('1+1=2', '+')).toEqual([{ text: '1', hit: false }, { text: '+', hit: true }, { text: '1=2', hit: false }])
  })
})
