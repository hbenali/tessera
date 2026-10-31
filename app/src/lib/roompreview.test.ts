import { describe as suite, expect, it } from 'vitest'
import { describe, previewLine, sortRooms, stripReplyFallback } from './roompreview'

const ev = (content: Record<string, unknown>, sender = '@a:x', type = 'm.room.message') => ({ type, sender, content })
const names = (id: string) => (id === '@a:x' ? 'Ann' : undefined)

suite('stripReplyFallback', () => {
  it('drops quoted lines', () => expect(stripReplyFallback('> <@b:x> hi\n> there\n\nanswer')).toBe('answer'))
  it('keeps plain text', () => expect(stripReplyFallback('hello')).toBe('hello'))
})

suite('previewLine', () => {
  const line = (c: Record<string, unknown>, dm = false, sender = '@a:x') => previewLine(describe(ev(c, sender), '@me:x', names), dm)
  it('names the sender in a room, not in a direct chat', () => {
    expect(line({ msgtype: 'm.text', body: 'hi' })).toBe('Ann: hi')
    expect(line({ msgtype: 'm.text', body: 'hi' }, true)).toBe('hi')
  })
  it('says You for my own', () => expect(line({ msgtype: 'm.text', body: 'hi' }, true, '@me:x')).toBe('You: hi'))
  it('hides the reply quote', () => expect(line({ msgtype: 'm.text', body: '> <@b:x> old\n\nnew' }, true)).toBe('new'))
  it('describes media and keeps a caption', () => {
    expect(line({ msgtype: 'm.image', body: 'a.png', filename: 'a.png' }, true)).toBe('Photo')
    expect(line({ msgtype: 'm.image', body: 'sunset', filename: 'a.png' }, true)).toBe('Photo: sunset')
    expect(line({ msgtype: 'm.audio', body: 'v', 'org.matrix.msc3245.voice': {} }, true)).toBe('Voice message')
    expect(line({ msgtype: 'm.file', body: 'r.pdf' }, true)).toBe('File: r.pdf')
    expect(line({ msgtype: 'm.video', body: 'v.mp4' }, true)).toBe('Video')
    expect(line({ msgtype: 'm.location', body: 'x' }, true)).toBe('Location')
  })
  it('shows an action', () => expect(line({ msgtype: 'm.emote', body: 'waves' })).toBe('Ann waves'))
  it('does not leak encrypted content', () => expect(previewLine(describe(ev({}, '@a:x', 'm.room.encrypted'), '@me:x', names), true)).toBe('Encrypted message'))
})

suite('sortRooms', () => {
  const r = (name: string, lastTs: number, o: Record<string, unknown> = {}) => ({ name, lastTs, unread: 0, highlight: 0, favourite: false, lowPriority: false, notifs: 'all', ...o })
  it('puts favourites first and low priority last, newest first inside', () => {
    const out = sortRooms([r('old', 1), r('low', 9, { lowPriority: true }), r('new', 5), r('fav', 2, { favourite: true })], 'activity')
    expect(out.map((x) => x.name)).toEqual(['fav', 'new', 'old', 'low'])
  })
  it('unread first puts mentions above unread above read, muted never counts', () => {
    const out = sortRooms([r('read', 9), r('unread', 1, { unread: 2 }), r('mention', 0, { unread: 1, highlight: 1 }), r('muted', 8, { unread: 5, notifs: 'mute' })], 'unread')
    expect(out.map((x) => x.name)).toEqual(['mention', 'unread', 'read', 'muted'])
  })
  it('sorts by name', () => expect(sortRooms([r('b', 1), r('A', 2)], 'name').map((x) => x.name)).toEqual(['A', 'b']))
})
