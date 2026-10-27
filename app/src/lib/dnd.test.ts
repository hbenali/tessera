import { describe, expect, it } from 'vitest'
import { DEFAULT_REPLY, DEFAULT_SCHEDULE, inSchedule, parseAutoReply, parseSchedule, replyText, scheduleEnd, type Schedule } from './dnd'

// 2026-11-02 is a Monday.
const at = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2026, 10, 1 + day, h, m) // day 0 = Sunday 1 Nov
}
const night: Schedule = { enabled: true, days: [1, 2, 3, 4, 5], from: '22:00', to: '08:00' } // Mon-Fri evenings

describe('quiet hours', () => {
  it('is never on when switched off or with no days', () => {
    expect(inSchedule({ ...night, enabled: false }, at(1, '23:00'))).toBe(false)
    expect(inSchedule({ ...night, days: [] }, at(1, '23:00'))).toBe(false)
  })
  it('covers an overnight window from the evening it starts', () => {
    expect(inSchedule(night, at(1, '22:00'))).toBe(true)
    expect(inSchedule(night, at(1, '23:59'))).toBe(true)
    expect(inSchedule(night, at(1, '21:59'))).toBe(false)
  })
  it('carries the morning end onto the next day, even a day that is not selected', () => {
    expect(inSchedule(night, at(2, '07:59'))).toBe(true) // Tuesday morning, from Monday night
    expect(inSchedule(night, at(2, '08:00'))).toBe(false)
    expect(inSchedule(night, at(6, '07:00'))).toBe(true) // Saturday morning, from Friday night
    expect(inSchedule(night, at(6, '23:00'))).toBe(false) // Saturday night is not selected
    expect(inSchedule(night, at(0, '07:00'))).toBe(false) // Sunday morning follows an unselected Saturday
  })
  it('handles a daytime window', () => {
    const work: Schedule = { enabled: true, days: [1], from: '09:00', to: '17:30' }
    expect(inSchedule(work, at(1, '09:00'))).toBe(true)
    expect(inSchedule(work, at(1, '17:29'))).toBe(true)
    expect(inSchedule(work, at(1, '17:30'))).toBe(false)
    expect(inSchedule(work, at(2, '10:00'))).toBe(false)
  })
  it('treats equal start and end as the whole day on selected days', () => {
    const all: Schedule = { enabled: true, days: [0, 6], from: '00:00', to: '00:00' }
    expect(inSchedule(all, at(0, '13:00'))).toBe(true)
    expect(inSchedule(all, at(3, '13:00'))).toBe(false)
  })
  it('reads stored data defensively', () => {
    expect(parseSchedule(null)).toEqual(DEFAULT_SCHEDULE)
    expect(parseSchedule({ enabled: true, days: [1, 1, 9, 'x', 3], from: 'nope', to: '07:15' })).toEqual({ enabled: true, days: [1, 3], from: '22:00', to: '07:15' })
  })
})

describe('quiet hours end', () => {
  it('is null outside a window', () => {
    expect(scheduleEnd(night, at(1, '12:00'))).toBeNull()
  })
  it('is tomorrow morning for the evening part of an overnight window, and this morning for the morning part', () => {
    expect(scheduleEnd(night, at(1, '23:00'))).toEqual(at(2, '08:00'))
    expect(scheduleEnd(night, at(2, '07:00'))).toEqual(at(2, '08:00'))
  })
  it('is midnight for a whole-day window', () => {
    const all: Schedule = { enabled: true, days: [1], from: '00:00', to: '00:00' }
    expect(scheduleEnd(all, at(1, '13:00'))).toEqual(at(2, '00:00'))
  })
})

describe('auto-reply', () => {
  it('falls back to the default message and never trusts stored types', () => {
    expect(parseAutoReply(null)).toEqual(DEFAULT_REPLY)
    expect(parseAutoReply({ enabled: 'yes', message: '   ', dms: 1 })).toEqual(DEFAULT_REPLY)
    expect(parseAutoReply({ enabled: true, message: 'x'.repeat(900) }).message).toHaveLength(500)
  })
  it('fills in the end time, or says later', () => {
    const now = at(1, '10:00')
    expect(replyText('Back at {until}.', at(1, '14:30'), now)).toMatch(/Back at .*14.*30|Back at .*2.*30/)
    expect(replyText('Back {until}.', null, now)).toBe('Back later.')
    expect(replyText('No token here', null, now)).toBe('No token here')
  })
})
