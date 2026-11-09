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

import { htmlRuns, flowRuns } from './richtext'
import { messageRuns, pickTheme } from './export'
import { render } from './markdown'

describe('formatted text', () => {
  const w = (r: { text: string }) => r.text.length
  it('turns markdown into styled runs, not source', () => {
    const runs = htmlRuns(render('**bold** and `code` and ~~gone~~ <b>&</b> https://x.io/a'))
    expect(runs.find((r) => r.bold)?.text).toBe('bold')
    expect(runs.find((r) => r.code)?.text).toBe('code')
    expect(runs.find((r) => r.strike)?.text).toBe('gone')
    expect(runs.find((r) => r.link)?.text).toBe('https://x.io/a')
    const text = runs.map((r) => r.text).join('')
    expect(text).toBe('bold and code and gone <b>&</b> https://x.io/a')
    expect(text).not.toContain('**')
  })
  it('shows a mention as a pill with the name', () => {
    const runs = htmlRuns(render('hi @ann:x.org', { name: () => 'Ann' }))
    expect(runs.find((r) => r.mention)?.text).toBe('@Ann')
  })
  it('marks quotes and code blocks and drops the break that ends them', () => {
    const lines = flowRuns(htmlRuns(render('> quoted\nafter\n```\nline1\nline2\n```')), 50, w)
    expect(lines.map((l) => [l.runs.map((r) => r.text).join(''), !!l.quote, !!l.pre])).toEqual([['quoted', true, false], ['after', false, false], ['line1', false, true], ['line2', false, true]])
  })
  it('wraps styled runs and cuts a long word', () => {
    const lines = flowRuns([{ text: 'aaa ' }, { text: 'bbbb', bold: true }, { text: ' cccccccccc' }], 6, w)
    expect(lines.every((l) => l.runs.map((r) => r.text).join('').length <= 6)).toBe(true)
    expect(lines.flatMap((l) => l.runs.map((r) => r.text)).join('').replace(/\s/g, '')).toBe('aaabbbbcccccccccc')
  })
  it('prints the source when asked, the result otherwise', () => {
    const m = { id: '1', senderName: 'A', ts: 0, body: '**hi**', html: render('**hi**') }
    expect(messageRuns(m).map((r) => r.text).join('')).toBe('hi')
    expect(messageRuns(m, true).map((r) => r.text).join('')).toBe('**hi**')
  })
  it('does not print a picture\'s file name as its text', () => expect(messageRuns({ id: '1', senderName: 'A', ts: 0, body: 'IMG_1.png', imageMxc: 'mxc://x/y' })).toEqual([]))
  it('csv follows the same choice', () => {
    const m = { id: '1', senderName: 'A', ts: 0, body: '**hi**', html: render('**hi**') }
    expect(toCsv([m])).toContain(',hi,')
    expect(toCsv([m], true)).toContain(',**hi**,')
  })
})

describe('pickTheme', () => {
  const app = { bg: 'x', panel: 'x', text: 'x', muted: 'x', tile: 'x', line: 'x', accent: 'x', accentInk: 'x', ink: 'x', ok: 'x', tones: [] }
  it('follows the app, or forces light or dark', () => {
    expect(pickTheme('app', app)).toBe(app)
    expect(pickTheme('light', app).bg).toBe('#ffffff')
    expect(pickTheme('dark', app).bg).toBe('#0f1115')
  })
})

import { mix } from './export'
describe('mix', () => {
  it('blends like color-mix', () => { expect(mix('#000000', '#ffffff', 50)).toBe('#808080'); expect(mix('#ff0000', '#0000ff', 100)).toBe('#ff0000') })
  it('keeps the first colour when it cannot read one', () => expect(mix('rgb(1,2,3)', '#ffffff', 50)).toBe('rgb(1,2,3)'))
})
describe('edited and mentions of me', () => {
  it('marks an edited message', () => expect(messageRuns({ id: '1', senderName: 'A', ts: 0, body: 'hi', edited: true }).at(-1)).toEqual({ text: ' (edited)', dim: true }))
  it('flags a mention of me in the runs', () => expect(htmlRuns(render('hi @me:x.org', { name: () => 'Me', me: '@me:x.org' })).find((r) => r.mention)?.me).toBe(true))
})
