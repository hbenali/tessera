import { describe, expect, it } from 'vitest'
import { firstUnread, startOfDay } from './jump'

const msgs = [{ id: 'a', mine: false }, { id: 'b', mine: true }, { id: 'c', mine: false }, { id: 'd', mine: false }]
describe('firstUnread', () => {
  it('is the first message of someone else after the read marker', () => expect(firstUnread(msgs, 'a')).toEqual({ id: 'c' }))
  it('skips my own messages', () => expect(firstUnread(msgs, 'b')).toEqual({ id: 'c' }))
  it('says none when everything is read', () => expect(firstUnread(msgs, 'd')).toBe('none'))
  it('asks for older history when the marker is not loaded', () => expect(firstUnread(msgs, 'zzz')).toBe('older'))
  it('starts at the first message when there is no marker', () => { expect(firstUnread(msgs, undefined)).toEqual({ id: 'a' }); expect(firstUnread([], undefined)).toBe('none') })
})
describe('startOfDay', () => {
  it('reads a date input value as local midnight', () => expect(startOfDay('2026-03-05')).toBe(new Date(2026, 2, 5).getTime()))
  it('rejects nonsense and impossible days', () => { expect(startOfDay('')).toBeUndefined(); expect(startOfDay('2026-02-31')).toBeUndefined() })
})
