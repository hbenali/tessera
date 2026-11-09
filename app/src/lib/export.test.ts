import { describe, expect, it } from 'vitest'
import { bodyText, fileName, paginate, sliceRange, wrapText } from './export'

const msgs = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, pending: false }))
const ids = (r: { id: string }[] | null) => r?.map((m) => m.id).join('')

describe('sliceRange', () => {
  it('no bounds means the whole room', () => expect(ids(sliceRange(msgs, { from: null, to: null }))).toBe('abcde'))
  it('includes both ends', () => expect(ids(sliceRange(msgs, { from: 'b', to: 'd' }))).toBe('bcd'))
  it('an open end runs to the start or the latest message', () => {
    expect(ids(sliceRange(msgs, { from: 'c', to: null }))).toBe('cde')
    expect(ids(sliceRange(msgs, { from: null, to: 'b' }))).toBe('ab')
  })
  it('swaps bounds given the wrong way round', () => expect(ids(sliceRange(msgs, { from: 'd', to: 'b' }))).toBe('bcd'))
  it('refuses a bound that is not loaded rather than exporting the wrong part', () => expect(sliceRange(msgs, { from: 'zz', to: null })).toBeNull())
  it('leaves out messages still being sent', () => expect(ids(sliceRange([...msgs, { id: 'p', pending: true }], { from: null, to: null }))).toBe('abcde'))
})

describe('wrapText', () => {
  const w = (s: string) => s.length
  it('wraps on spaces', () => expect(wrapText('one two three four', 9, w)).toEqual(['one two', 'three', 'four']))
  it('keeps blank lines and line breaks', () => expect(wrapText('a\n\nb', 10, w)).toEqual(['a', '', 'b']))
  it('cuts a word wider than a line, losing nothing', () => {
    const out = wrapText('abcdefghij', 4, w)
    expect(out.every((l) => l.length <= 4)).toBe(true)
    expect(out.join('')).toBe('abcdefghij')
  })
})

describe('paginate', () => {
  it('starts a new page when the next block does not fit', () => expect(paginate([40, 40, 40, 40], 100)).toEqual([[0, 1], [2, 3]]))
  it('gives a block taller than a page its own page', () => expect(paginate([10, 500, 10], 100)).toEqual([[0], [1], [2]]))
  it('has no page for no blocks', () => expect(paginate([], 100)).toEqual([]))
})

describe('fileName', () => {
  const d = new Date(2026, 10, 9)
  it('makes a safe slug', () => expect(fileName('Café Support / VIP!', d, 1, 1)).toBe('cafe-support-vip-2026-11-09.png'))
  it('numbers pages only when there are several', () => expect(fileName('x', d, 2, 3)).toBe('x-2026-11-09-2.png'))
  it('falls back when the name has no letters', () => expect(fileName('★★', d, 1, 1)).toBe('chat-2026-11-09.png'))
})

describe('bodyText', () => {
  const m = { id: '1', senderName: 'A', ts: 0 }
  it('shows the text', () => expect(bodyText({ ...m, body: 'hi' })).toBe('hi'))
  it('names an attachment', () => expect(bodyText({ ...m, body: 'log.txt', attachment: { name: 'log.txt' } })).toBe('📎 log.txt'))
  it('never prints ciphertext for a message it could not decrypt', () => expect(bodyText({ ...m, body: 'ciphertext', undecryptable: true })).toContain('Unable to decrypt'))
})

import { buildPdf, csvCell, toCsv } from './export'

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"'))
  it('defuses spreadsheet formulas', () => {
    for (const v of ['=1+1', '+SUM(A1)', '-2', '@cmd', '\tx']) expect(csvCell(v).replace(/^"/, '')).toMatch(/^'/)
  })
  it('has a header, a BOM and one row per message', () => {
    const c = toCsv([{ id: '1', senderName: 'Ann', sender: '@ann:x', body: 'hi, you', ts: Date.UTC(2026, 0, 2, 3, 4, 5), reactions: { '👍': 2 } }])
    expect(c.startsWith('\ufeffTime (ISO 8601),Sender,Sender ID,Message,Reactions\r\n')).toBe(true)
    expect(c).toContain('2026-01-02T03:04:05.000Z,Ann,\'@ann:x,"hi, you",👍 2\r\n')
  })
})

describe('buildPdf', () => {
  const pdf = buildPdf([{ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 720, height: 400 }, { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 720, height: 300 }])
  const text = new TextDecoder('latin1').decode(pdf)
  it('is a PDF with one page per picture', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Count 2')
  })
  it('xref offsets point at the objects', () => {
    const start = Number(/startxref\n(\d+)/.exec(text)![1])
    const entries = text.slice(start).split('\n').slice(3, 3 + 8)
    entries.forEach((e, i) => expect(text.slice(Number(e.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })
})
