import { describe, expect, it } from 'vitest'
import { rank, splitServer, toPublicRoom } from './directory'

describe('directory', () => {
  it('maps a room and falls back to its alias for a name', () => {
    expect(toPublicRoom({ room_id: '!a:x', canonical_alias: '#a:x', num_joined_members: 4 })).toMatchObject({ name: '#a:x', members: 4, join: 'public' })
    expect(toPublicRoom({ room_id: '!a:x', name: ' Hi ', join_rule: 'knock', topic: ' ' })).toMatchObject({ name: 'Hi', join: 'knock', topic: undefined })
  })
  it('ranks by size and hides rooms I am in', () => {
    const r = (id: string, members: number) => toPublicRoom({ room_id: id, name: id, num_joined_members: members })
    expect(rank([r('!b', 1), r('!a', 9), r('!c', 9), r('!me', 99)], new Set(['!me'])).map((x) => x.id)).toEqual(['!a', '!c', '!b'])
  })
  it('reads another server from the search', () => {
    expect(splitServer('rust @ matrix.org')).toEqual({ term: 'rust', server: 'matrix.org' })
    expect(splitServer('rust')).toEqual({ term: 'rust' })
    expect(splitServer('mail me@home')).toEqual({ term: 'mail me@home' })
  })
})
