import { describe, expect, it } from 'vitest'
import { galleryLinks, galleryMessages, hostOf, linksOf, monthGroups } from './gallery'

const m = (id: string, ts: number, extra: Record<string, unknown> = {}) => ({ id, ts, body: '', ...extra })
const day = (mo: number, d: number) => new Date(2026, mo, d, 12).getTime()

describe('galleryMessages', () => {
  const msgs = [m('a', 1, { imageMxc: 'mxc://x/a' }), m('b', 2, { attachment: {} }), m('c', 3, { imageMxc: 'mxc://x/c', sticker: true }), m('d', 4, { imageMxc: 'mxc://x/d' }), m('e', 5, { audio: {} }), m('f', 6, { imageMxc: 'mxc://x/f', pending: true }), m('g', 7, { imageMxc: 'mxc://x/g', undecryptable: true })]
  it('media is pictures, newest first, without stickers, pending or undecryptable ones', () => expect(galleryMessages(msgs, 'media').map((x) => x.id)).toEqual(['d', 'a']))
  it('files include voice messages', () => expect(galleryMessages(msgs, 'files').map((x) => x.id)).toEqual(['e', 'b']))
})

describe('links', () => {
  it('finds links without trailing punctuation, once each', () => expect(linksOf('see https://a.io/x, and (https://b.io) then https://a.io/x.')).toEqual(['https://a.io/x', 'https://b.io']))
  it('lists links newest message first, numbering several in one message', () => {
    const l = galleryLinks([m('1', 1, { body: 'https://a.io' }), m('2', 2, { body: 'no link' }), m('3', 3, { body: 'https://b.io https://c.io' })])
    expect(l.map((x) => x.id)).toEqual(['3#0', '3#1', '1#0'])
  })
  it('skips pictures and polls, reads a file caption', () => {
    const l = galleryLinks([m('1', 1, { body: 'https://a.io', imageMxc: 'x' }), m('2', 2, { body: 'f.txt', attachment: { caption: 'doc https://c.io' } }), m('3', 3, { body: 'https://p.io', poll: {} })])
    expect(l.map((x) => x.url)).toEqual(['https://c.io'])
  })
  it('names the site', () => { expect(hostOf('https://www.example.com/a?b=1')).toBe('example.com'); expect(hostOf('nonsense')).toBe('nonsense') })
})

describe('monthGroups', () => {
  const items = [m('a', day(10, 20)), m('b', day(10, 2)), m('c', day(9, 30)), m('d', day(9, 1)), m('e', day(0, 5))]
  const g = monthGroups(items, (x) => x.ts, (d) => String(d.getMonth()))
  it('groups consecutive items of one month, keeping the order', () => expect(g.map((x) => [x.key, x.items.map((i) => i.id).join('')])).toEqual([['2026-11', 'ab'], ['2026-10', 'cd'], ['2026-01', 'e']]))
  it('has no groups for no items', () => expect(monthGroups([], () => 0, () => '')).toEqual([]))
})
