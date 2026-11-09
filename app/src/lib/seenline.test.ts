import { describe, expect, it } from 'vitest'
import { seenLine } from './seenline'

const fmt = () => '10:00'
const m = (id: string, mine: boolean, extra: object = {}) => ({ id, mine, ...extra }) as never

describe('seenLine', () => {
  it('is null when none of my messages is loaded', () => {
    expect(seenLine([m('a', false)], true, fmt)).toBeNull()
  })
  it('reports sending, sent and failed', () => {
    expect(seenLine([m('a', true, { state: 'sending' })], true, fmt)?.text).toBe('Sending…')
    expect(seenLine([m('a', true, { state: 'sent' })], true, fmt)?.text).toBe('Sent')
    expect(seenLine([m('a', true, { state: 'failed' })], true, fmt)?.state).toBe('failed')
  })
  it('names the reader and time in a DM', () => {
    const msgs = [m('a', true, { state: 'seen', seenBy: [{ id: '@b', name: 'Bo', ts: 1 }] })]
    expect(seenLine(msgs, true, fmt)).toEqual({ state: 'seen', text: 'Seen by Bo · 10:00' })
  })
  it('summarises groups', () => {
    const msgs = [m('a', true, { state: 'seen', seenBy: [{ id: '@b', name: 'Bo', ts: 3 }, { id: '@c', name: 'Cy', ts: 2 }, { id: '@d', name: 'Di', ts: 1 }] })]
    expect(seenLine(msgs, false, fmt)?.text).toBe('Seen by Bo, Cy and 1 other')
  })
  it('is null once someone else has replied', () => {
    expect(seenLine([m('a', true, { state: 'seen' }), m('b', false)], true, fmt)).toBeNull()
  })
  it('falls back to plain Seen when no reader is attached', () => {
    expect(seenLine([m('a', true, { state: 'seen' })], false, fmt)?.text).toBe('Seen')
  })
})
