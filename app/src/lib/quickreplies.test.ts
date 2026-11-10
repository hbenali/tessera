import { describe, expect, it } from 'vitest'
import { DEFAULT_QUICK, MAX_QUICK, MAX_QUICK_LENGTH, cleanQuickReplies, parseQuickReplies } from './quickreplies'

describe('cleanQuickReplies', () => {
  it('trims, keeps order, drops empties', () => expect(cleanQuickReplies(['  OK ', '', '   ', 'Thanks'])).toEqual(['OK', 'Thanks']))
  it('keeps one line: line breaks and control characters become spaces', () => expect(cleanQuickReplies(['On my\nway\t!', 'a\u0000b'])).toEqual(['On my way !', 'a b']))
  it('drops repeats, ignoring case', () => expect(cleanQuickReplies(['ok', 'OK', 'Ok ', 'Thanks'])).toEqual(['ok', 'Thanks']))
  it('keeps at most three and 40 characters each', () => {
    expect(cleanQuickReplies(['a', 'b', 'c', 'd', 'e'])).toHaveLength(MAX_QUICK)
    expect(cleanQuickReplies(['x'.repeat(100)])[0]).toHaveLength(MAX_QUICK_LENGTH)
  })
  it('ignores what is not text', () => expect(cleanQuickReplies([1, null, { a: 1 }, 'Yes'] as unknown[])).toEqual(['Yes']))
})

describe('parseQuickReplies', () => {
  it('gives the defaults when nothing was saved', () => { for (const v of [undefined, null, {}, 'x', { replies: 'no' }]) expect(parseQuickReplies(v)).toEqual([...DEFAULT_QUICK]) })
  it('keeps a saved list, tidied', () => expect(parseQuickReplies({ replies: ['  Yes ', 'No', 'Yes'] })).toEqual(['Yes', 'No']))
  it('keeps an empty saved list as off, not as the defaults', () => expect(parseQuickReplies({ replies: [] })).toEqual([]))
})
