import { describe, expect, it } from 'vitest'
import { deviceTitle, isStale, lastSeen, orderDevices } from './devices'

const now = Date.UTC(2026, 9, 31)
const day = 86_400_000
const d = (id: string, lastTs?: number, current = false, name = '') => ({ id, name, lastTs, current })

describe('devices', () => {
  it('puts this session first, then newest, never-seen last', () => {
    expect(orderDevices([d('A', now - 5 * day), d('B'), d('C', now - day), d('ME', now - 9 * day, true)]).map((x) => x.id)).toEqual(['ME', 'C', 'A', 'B'])
  })
  it('flags sessions idle for more than 90 days, never this one', () => {
    expect(isStale(d('x', now - 100 * day), now)).toBe(true)
    expect(isStale(d('x', now - 10 * day), now)).toBe(false)
    expect(isStale(d('x'), now)).toBe(true)
    expect(isStale(d('x', now - 400 * day, true), now)).toBe(false)
  })
  it('describes when it was last seen', () => {
    expect(lastSeen(d('x', now - 3 * day), now)).toBe('Last seen 3 days ago')
    expect(lastSeen({ ...d('x', now - 100), lastIp: '1.2.3.4' }, now)).toBe('Last seen today from 1.2.3.4')
    expect(lastSeen(d('x', now - day), now)).toBe('Last seen yesterday')
    expect(lastSeen(d('x'), now)).toBe('Never seen')
    expect(lastSeen(d('x', 0, true), now)).toBe('This session')
  })
  it('falls back to the id when a session has no name', () => { expect(deviceTitle(d('ABC'))).toBe('ABC'); expect(deviceTitle(d('ABC', 0, false, ' Phone '))).toBe('Phone') })
})
