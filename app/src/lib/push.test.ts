import { describe, expect, it, vi } from 'vitest'
import { within } from './push'

describe('within', () => {
  it('passes a result through', async () => { await expect(within(Promise.resolve(3), 50)).resolves.toBe(3) })
  it('gives up on a promise that never settles', async () => {
    vi.useFakeTimers()
    const p = within(new Promise(() => {}), 1000, 'The service worker')
    const assertion = expect(p).rejects.toThrow('The service worker took too long')
    await vi.advanceTimersByTimeAsync(1001)
    await assertion
    vi.useRealTimers()
  })
  it('passes an error through', async () => { await expect(within(Promise.reject(new Error('x')), 50)).rejects.toThrow('x') })
})
