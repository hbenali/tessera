import { describe, expect, it } from 'vitest'
import { dayLabel, initials, tone } from './ui.svelte'

describe('ui helpers', () => {
  it('gives a stable tone in range for any name', () => {
    expect(tone('alice')).toBe(tone('alice'))
    for (const n of ['', 'a', 'bob', '#general', '日本語', 'x'.repeat(500)]) {
      expect(tone(n)).toBeGreaterThanOrEqual(0)
      expect(tone(n)).toBeLessThan(6)
    }
  })

  it('builds initials without room or user sigils', () => {
    expect(initials('#general')).toBe('GE')
    expect(initials('@bob:localhost')).toBe('BO')
    expect(initials('  x')).toBe('X')
  })

  it('labels recent days', () => {
    expect(dayLabel(Date.now())).toBe('Today')
    expect(dayLabel(Date.now() - 86_400_000)).toBe('Yesterday')
    expect(dayLabel(Date.now() - 5 * 86_400_000)).not.toMatch(/Today|Yesterday/)
  })
})
