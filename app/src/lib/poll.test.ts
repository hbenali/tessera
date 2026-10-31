import { describe, expect, it } from 'vitest'
import { parsePollStart, pollContent, tally, toggleSelection } from './poll'

const poll = parsePollStart(pollContent('Lunch?', ['Pizza', 'Sushi', 'Salad'], true, 1))!
const r = (sender: string, ts: number, ...selections: string[]) => ({ sender, ts, selections })

describe('poll content', () => {
  it('round-trips what we send', () => {
    expect(poll.question).toBe('Lunch?')
    expect(poll.answers.map((a) => a.text)).toEqual(['Pizza', 'Sushi', 'Salad'])
    expect(poll.disclosed).toBe(true)
    expect(poll.maxSelections).toBe(1)
    expect(parsePollStart(pollContent('q', ['a', 'b'], false, 9))).toMatchObject({ disclosed: false, maxSelections: 2 })
  })
  it('reads the older unstable shape and rejects a poll with fewer than two answers', () => {
    expect(parsePollStart({ 'org.matrix.msc3381.poll.start': { question: { body: 'Q' }, answers: [{ id: 'x', 'org.matrix.msc1767.text': 'X' }, { id: 'y', 'org.matrix.msc1767.text': 'Y' }] } })?.question).toBe('Q')
    expect(parsePollStart(pollContent('q', ['only'], true, 1))).toBeUndefined()
    expect(parsePollStart({})).toBeUndefined()
  })
})

describe('tally', () => {
  it('counts each person once, by their latest vote', () => {
    const t = tally(poll, [r('@a:x', 1, 'a1'), r('@a:x', 5, 'a2'), r('@b:x', 2, 'a2'), r('@c:x', 3, 'a3')], undefined, '@a:x')
    expect(t.counts).toEqual({ a1: 0, a2: 2, a3: 1 })
    expect(t.voters).toBe(3)
    expect(t.mine).toEqual(['a2'])
  })
  it('drops unknown answers, extra selections, and votes after the end', () => {
    const t = tally(poll, [r('@a:x', 1, 'zzz'), r('@b:x', 2, 'a1', 'a2'), r('@c:x', 9, 'a3')], 5, '@z:x')
    expect(t.counts).toEqual({ a1: 1, a2: 0, a3: 0 })
    expect(t.voters).toBe(1)
    expect(t.ended).toBe(true)
  })
  it('an empty vote takes the vote back', () => {
    expect(tally(poll, [r('@a:x', 1, 'a1'), r('@a:x', 2)], undefined, '@a:x').voters).toBe(0)
  })
  it('hides undisclosed results until the poll ends', () => {
    const hidden = parsePollStart(pollContent('q', ['a', 'b'], false, 1))!
    expect(tally(hidden, [], undefined, '@a:x').visible).toBe(false)
    expect(tally(hidden, [], 1, '@a:x').visible).toBe(true)
    expect(tally(poll, [], undefined, '@a:x').visible).toBe(true)
  })
})

describe('toggleSelection', () => {
  it('single choice replaces or clears', () => { expect(toggleSelection(['a1'], 'a2', 1)).toEqual(['a2']); expect(toggleSelection(['a1'], 'a1', 1)).toEqual([]) })
  it('multiple choice toggles up to the limit', () => {
    expect(toggleSelection(['a1'], 'a2', 2)).toEqual(['a1', 'a2'])
    expect(toggleSelection(['a1', 'a2'], 'a3', 2)).toEqual(['a1', 'a2'])
    expect(toggleSelection(['a1', 'a2'], 'a1', 2)).toEqual(['a2'])
  })
})
