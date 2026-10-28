import { describe, expect, it } from 'vitest'
import { waveformOf } from './recorder'

describe('waveformOf', () => {
  it('has nothing for no samples, and never more points than asked', () => {
    expect(waveformOf([])).toEqual([])
    expect(waveformOf(Array.from({ length: 1000 }, (_, i) => i / 1000), 100)).toHaveLength(100)
    expect(waveformOf([0.1, 0.2, 0.3], 100)).toHaveLength(3)
  })
  it('scales the loudest part to 1024 and keeps the shape', () => {
    const w = waveformOf([0.05, 0.1, 0.4, 0.2], 4)
    expect(Math.max(...w)).toBe(1024)
    expect(w[2]).toBe(1024)
    expect(w[0]).toBeLessThan(w[1])
    expect(w.every((v) => v >= 0 && v <= 1024 && Number.isInteger(v))).toBe(true)
  })
  it('keeps a near-silent recording low instead of stretching noise to full height', () => {
    const w = waveformOf([0.001, 0.002, 0.001, 0.003], 4)
    expect(Math.max(...w)).toBeLessThan(100)
  })
  it('takes the loudest sample of each bar', () => {
    expect(waveformOf([0.1, 0.9, 0.1, 0.2], 2)).toEqual([1024, Math.round((0.2 / 0.9) * 1024)])
  })
})
