import { describe, expect, it } from 'vitest'
import { activityTs, memberNotice } from './membership'

const nameOf = (id: string) => id.slice(1, id.indexOf(':'))
const ev = (content: Record<string, unknown>, prev?: Record<string, unknown>, sender = '@a:x') => ({ sender, stateKey: '@a:x', content, prev })

describe('memberNotice', () => {
  it('reports a name change, even to look-alike letters', () => {
    expect(memberNotice(ev({ membership: 'join', displayname: 'Нoussem Веn Аli' }, { membership: 'join', displayname: 'Houssem Ben Ali' }), nameOf)).toBe('Houssem Ben Ali changed their name to Нoussem Веn Аli')
  })
  it('reports an avatar change, and ignores a join that changed nothing', () => {
    expect(memberNotice(ev({ membership: 'join', avatar_url: 'mxc://b' }, { membership: 'join', avatar_url: 'mxc://a' }), nameOf)).toBe('a changed their avatar')
    expect(memberNotice(ev({ membership: 'join', displayname: 'A' }, { membership: 'join', displayname: 'A' }), nameOf)).toBeNull()
  })
  it('reports joins, leaves and removals', () => {
    expect(memberNotice(ev({ membership: 'join' }, { membership: 'leave' }), nameOf)).toBe('a joined')
    expect(memberNotice(ev({ membership: 'leave' }, { membership: 'join' }), nameOf)).toBe('a left')
    expect(memberNotice(ev({ membership: 'leave' }, { membership: 'join' }, '@m:x'), nameOf)).toBe('a was removed')
  })
})

describe('activityTs', () => {
  it('ignores membership events, so a name change does not move the room', () => {
    expect(activityTs([{ type: 'm.room.message', ts: 100 }, { type: 'm.room.member', ts: 900 }])).toBe(100)
  })
  it('counts the invitation when it is all there is', () => {
    expect(activityTs([{ type: 'm.room.member', ts: 900 }], true)).toBe(900)
    expect(activityTs([{ type: 'm.room.member', ts: 900 }])).toBe(0)
  })
})
