import { describe, expect, it } from 'vitest'
import { MAX_ROOMS, SNAP_KEY, clearSnapshot, makeSnapshot, readSnapshot, writeSnapshot } from './snapshot'

const room = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Room ${id}`, lastTs: 1, unread: 0, highlight: 0, isDM: false, encrypted: false, preview: 'Ann: hello', notifs: 'all', isSpace: false, invited: false, ...extra })
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m } }

describe('snapshot', () => {
  it('keeps order, skips spaces and invitations, and caps the count', () => {
    const many = Array.from({ length: 100 }, (_, i) => room(`!r${i}`))
    const s = makeSnapshot([room('!sp', { isSpace: true }), room('!inv', { invited: true }), ...many])
    expect(s).toHaveLength(MAX_ROOMS)
    expect(s[0].id).toBe('!r0')
  })
  it('never keeps the text of an encrypted room\'s last message', () => {
    const s = makeSnapshot([room('!e', { encrypted: true, preview: 'Ann: my secret plan' }), room('!p')])
    expect(JSON.stringify(s)).not.toContain('secret plan')
    expect(s[0].preview).toBe('')
    expect(s[1].preview).toBe('Ann: hello')
  })
  it('round-trips through storage, per user, and can be cleared', () => {
    const st = memory()
    writeSnapshot('@a:x', [room('!1', { unread: 3, notifs: 'mute' })], st)
    expect(readSnapshot('@a:x', st)).toEqual([{ id: '!1', name: 'Room !1', lastTs: 1, unread: 3, highlight: 0, isDM: false, encrypted: false, preview: 'Ann: hello', muted: true }])
    expect(readSnapshot('@b:x', st)).toEqual([])
    clearSnapshot('@a:x', st)
    expect(st.m.has(SNAP_KEY('@a:x'))).toBe(false)
  })
  it('ignores damaged data', () => {
    const st = memory()
    st.setItem(SNAP_KEY('@a:x'), '{oops')
    expect(readSnapshot('@a:x', st)).toEqual([])
    st.setItem(SNAP_KEY('@a:x'), JSON.stringify([{ id: 1 }, null, room('!ok')]))
    expect(readSnapshot('@a:x', st).map((r) => r.id)).toEqual(['!ok'])
  })
})
