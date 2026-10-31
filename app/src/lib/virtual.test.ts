import { describe, expect, it } from 'vitest'
import { THRESHOLD, computeWindow, gaps, totalHeight } from './virtual'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`)
const none = () => undefined

describe('computeWindow', () => {
  it('renders everything below the threshold, with no spacers', () => {
    expect(computeWindow(ids(THRESHOLD), none, 5000, 800)).toEqual({ start: 0, end: THRESHOLD, top: 0, bottom: 0 })
  })
  it('renders only the neighbourhood of the viewport in a long list', () => {
    const w = computeWindow(ids(5000), none, 100_000, 800, undefined, 50, 1000)
    expect(w.start).toBeGreaterThan(1900)
    expect(w.end - w.start).toBeLessThan(80)
    expect(w.top).toBe(w.start * 50)
    expect(w.bottom).toBe((5000 - w.end) * 50)
  })
  it('spacers plus drawn rows always add up to the whole list', () => {
    const heights: Record<string, number> = { r2500: 400, r2510: 90 }
    const h = (id: string) => heights[id]
    for (const top of [0, 1234, 125_000, 249_000, 400_000]) {
      const w = computeWindow(ids(5000), h, top, 900, undefined, 50)
      let drawn = 0
      for (let i = w.start; i < w.end; i++) drawn += h(`r${i}`) ?? 50
      expect(w.top + drawn + w.bottom).toBe(5000 * 50 + 350 + 40)
    }
  })
  it('at the very top and very bottom the window reaches the edge', () => {
    const t = computeWindow(ids(1000), none, 0, 800, undefined, 50, 500)
    expect(t.start).toBe(0)
    expect(t.top).toBe(0)
    const b = computeWindow(ids(1000), none, 1000 * 50 - 800, 800, undefined, 50, 500)
    expect(b.end).toBe(1000)
    expect(b.bottom).toBe(0)
  })
  it('uses measured heights over the estimate', () => {
    const w = computeWindow(ids(1000), (id) => (id === 'r0' ? 5000 : undefined), 6000, 800, undefined, 50, 100)
    // r0 alone is 5000 tall; rows after it are 50 each, so row 19 is the first that reaches the 5900 line
    expect(w.start).toBe(19)
    expect(w.top).toBe(5000 + 18 * 50)
  })
  it('draws around a jump target far from the viewport, not everything in between', () => {
    const w = computeWindow(ids(5000), none, 0, 800, 4000, 50, 500)
    expect(w.start).toBeGreaterThan(3900)
    expect(w.start).toBeLessThanOrEqual(4000)
    expect(w.end).toBeGreaterThan(4000)
    expect(w.end - w.start).toBeLessThan(60)
    expect(w.top + (w.end - w.start) * 50 + w.bottom).toBe(5000 * 50)
  })
  it('leaves the window alone when the target is already inside it', () => {
    expect(computeWindow(ids(5000), none, 100_000, 800, 2010, 50, 500)).toEqual(computeWindow(ids(5000), none, 100_000, 800, undefined, 50, 500))
  })
})

describe('gaps', () => {
  it('takes each row height from the distance to the next row', () => {
    const g = gaps([{ id: 'a', top: 100 }, { id: 'b', top: 160.4 }, { id: 'c', top: 400 }], { id: 'c', height: 55.6 })
    expect([...g]).toEqual([['a', 60], ['b', 240], ['c', 56]])
  })
  it('knows nothing about a single unmeasured row without its own height', () => expect(gaps([{ id: 'a', top: 1 }], undefined).size).toBe(0))
})

describe('totalHeight', () => {
  it('adds measured and estimated heights', () => expect(totalHeight(['a', 'b', 'c'], (id) => (id === 'b' ? 100 : undefined), 10)).toBe(120))
})
