import { describe, expect, it } from 'vitest'
import { format, parse } from './route'

describe('route', () => {
  it('round-trips a room and an event', () => {
    const r = { room: '!abc:matrix.org', event: '$ev+/1=' }
    expect(parse(format(r))).toEqual(r)
    expect(parse(format({ room: '!abc:matrix.org' }))).toEqual({ room: '!abc:matrix.org' })
  })
  it('accepts a room alias', () => {
    expect(parse(format({ room: '#general:example.org' }))).toEqual({ room: '#general:example.org' })
  })
  it('formats no room as an empty hash', () => {
    expect(format({})).toBe('')
  })
  it('keeps the room but drops an event id that is not one', () => {
    expect(parse('#/room/!a:b/notanevent')).toEqual({ room: '!a:b' })
  })
  it('ignores anything that is not a room reference', () => {
    for (const h of ['', '#', '#/', '#/room/', '#/room/notaroom', '#/room/%zz', '#/other/!a:b', '#/room/!a:b/$x/extra', '#/room/javascript:alert(1)'])
      expect(parse(h).room ?? null).toBeNull()
  })
})
