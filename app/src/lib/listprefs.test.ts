import { describe, expect, it } from 'vitest'
import { DEFAULTS, KEY, WIDTH, clampWidth, groupRooms, parseListPrefs, readListPrefs, sectionOf, writeListPrefs } from './listprefs'

const room = (id: string, x: Record<string, unknown> = {}) => ({ id, favourite: false, isDM: false, lowPriority: false, unread: 0, notifs: 'all', ...x })
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }

describe('parseListPrefs', () => {
  it('gives the defaults for nothing, junk or the wrong type', () => {
    for (const v of [undefined, null, 'x', 7, [], {}]) expect(parseListPrefs(v)).toEqual(DEFAULTS)
  })
  it('keeps good values and drops bad ones one by one', () => {
    const p = parseListPrefs({ width: 400, rows: 'compact', avatar: 'huge', previews: 'yes', sections: true, badge: 'dot', icons: false, rail: true })
    expect(p).toMatchObject({ width: 400, rows: 'compact', avatar: 'normal', previews: true, sections: true, badge: 'dot', icons: false, rail: true })
  })
  it('keeps the width inside its limits', () => {
    expect(clampWidth(10)).toBe(WIDTH.min)
    expect(clampWidth(9000)).toBe(WIDTH.max)
    expect(clampWidth(NaN)).toBe(WIDTH.dflt)
    expect(parseListPrefs({ width: 1 }).width).toBe(WIDTH.min)
  })
  it('keeps only known folded sections, once each', () => expect(parseListPrefs({ folded: ['fav', 'fav', 'nope', 'low', 7] }).folded).toEqual(['fav', 'low']))
})

describe('storage', () => {
  it('round-trips', () => {
    const st = memory()
    writeListPrefs({ ...DEFAULTS, width: 360, rail: true }, st)
    expect(readListPrefs(st)).toMatchObject({ width: 360, rail: true })
  })
  it('survives damaged data', () => {
    const st = memory()
    st.setItem(KEY, '{oops')
    expect(readListPrefs(st)).toEqual(DEFAULTS)
  })
})

describe('groupRooms', () => {
  const rooms = [room('a', { favourite: true, unread: 2 }), room('b', { isDM: true, unread: 1 }), room('c'), room('d', { lowPriority: true, favourite: true }), room('e', { isDM: true, notifs: 'mute', unread: 5 })]
  it('puts each room under one heading: low priority, then favourite, then direct chat', () => {
    expect(rooms.map(sectionOf)).toEqual(['fav', 'people', 'rooms', 'low', 'people'])
  })
  it('keeps the order within a heading and the heading order, and leaves out empty ones', () => {
    const g = groupRooms(rooms, [])
    expect(g.map((s) => [s.id, s.items.map((r) => r.id).join('')])).toEqual([['fav', 'a'], ['people', 'be'], ['rooms', 'c'], ['low', 'd']])
    expect(groupRooms([room('x')], []).map((s) => s.id)).toEqual(['rooms'])
  })
  it('counts unread for a heading without muted rooms, and marks folded ones', () => {
    const g = groupRooms(rooms, ['people'])
    expect(g.find((s) => s.id === 'people')).toMatchObject({ unread: 1, folded: true })
    expect(g.find((s) => s.id === 'fav')?.folded).toBe(false)
  })
})
