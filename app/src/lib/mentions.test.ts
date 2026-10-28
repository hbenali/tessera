import { describe, expect, it } from 'vitest'
import { fromComposer, mentionPills, mentionRanges, mentionsUser, toComposer, plainMentions } from './mentions'

const me = '@alice:localhost'
describe('mentionsUser', () => {
  it('trusts structured mentions over the body text', () => {
    expect(mentionsUser({ body: 'hi', 'm.mentions': { user_ids: [me] } }, me)).toBe(true)
    expect(mentionsUser({ body: 'hi alice', 'm.mentions': { user_ids: ['@bob:localhost'] } }, me, 'alice')).toBe(false)
    expect(mentionsUser({ body: 'all', 'm.mentions': { room: true } }, me)).toBe(true)
  })
  it('falls back to the user id or display name in the body', () => {
    expect(mentionsUser({ body: 'ping @alice:localhost' }, me)).toBe(true)
    expect(mentionsUser({ body: 'hey Alice, look' }, me, 'Alice')).toBe(true)
    expect(mentionsUser({ body: 'malice in wonderland' }, me, 'Alice')).toBe(false)
  })
  it('does not treat regex characters in a display name as a pattern', () => {
    expect(mentionsUser({ body: 'anything' }, me, '.*+')).toBe(false)
  })
})

describe('plainMentions', () => {
  const name = (id: string) => (id === '@bob:localhost' ? 'Bob' : undefined)
  it('swaps known ids for display names and keeps unknown ones readable', () => {
    expect(plainMentions('thanks @bob:localhost and @eve:other.org!', name)).toBe('thanks @Bob and @eve:other.org!')
  })
  it('leaves ids inside URLs alone', () => {
    expect(plainMentions('see https://x.org/@bob:localhost', name)).toBe('see https://x.org/@bob:localhost')
  })
})

describe('mentions in the message box', () => {
  const picked = { 'Bob Marley': '@bob:localhost', Bo: '@bo:localhost' }
  it('shows names and sends ids', () => {
    expect(fromComposer('hi @Bob Marley, see this', picked)).toBe('hi @bob:localhost, see this')
    expect(fromComposer('@Bo and @Bob Marley', picked)).toBe('@bo:localhost and @bob:localhost')
  })
  it('does not turn part of a longer word into a mention', () => {
    expect(fromComposer('@Bobby is not @Bo', picked)).toBe('@Bobby is not @bo:localhost')
    expect(fromComposer('mail me at a@Bo.example', picked)).toBe('mail me at a@Bo.example')
  })
  it('finds the ranges to draw as pills, longest name first', () => {
    const t = 'hey @Bob Marley and @Bo!'
    expect(mentionRanges(t, picked).map(([a, b]) => t.slice(a, b))).toEqual(['@Bob Marley', '@Bo'])
    expect(mentionRanges('nothing', picked)).toEqual([])
    expect(mentionRanges('@x', {})).toEqual([])
  })
  it('treats names as text, never as a pattern', () => {
    const odd = { 'A.B (c)+': '@ab:localhost' }
    expect(fromComposer('@A.B (c)+ ok, @AxB (c)+ not', odd)).toBe('@ab:localhost ok, @AxB (c)+ not')
  })
  it('turns ids back into names for an edit or a draft, and round-trips', () => {
    const name = (id: string) => ({ '@bob:localhost': 'Bob Marley' })[id]
    const { text, picked: p } = toComposer('hi @bob:localhost and @who:localhost', name)
    expect(text).toBe('hi @Bob Marley and @who:localhost') // an unknown id stays as it is
    expect(fromComposer(text, p)).toBe('hi @bob:localhost and @who:localhost')
  })
  it('leaves an id alone when two people share a name', () => {
    const { text } = toComposer('@a:x and @b:x', () => 'Alex')
    expect(text).toBe('@Alex and @b:x')
  })
})

describe('mentions written by other clients', () => {
  const html = (a: string) => ({ format: 'org.matrix.custom.html', formatted_body: a })
  it('reads the people from formatted_body links', () => {
    expect(mentionPills(html('Je vais partager la clé avec <a href="https://matrix.to/#/@samuel:exo.test">Samuel Renault</a>'), () => undefined)).toEqual([{ id: '@samuel:exo.test', label: 'Samuel Renault' }])
    expect(mentionPills(html('<a href="https://matrix.to/#/%40a%3Ax.org">@Ann &amp; Co</a>'), () => undefined)).toEqual([{ id: '@a:x.org', label: 'Ann & Co' }])
    expect(mentionPills(html('<a href="matrix:u/b:x.org">Bea</a>'), () => undefined)).toEqual([{ id: '@b:x.org', label: 'Bea' }])
  })
  it('falls back to m.mentions with the member name', () => {
    expect(mentionPills({ 'm.mentions': { user_ids: ['@c:x.org'] } }, (id) => (id === '@c:x.org' ? 'Cleo' : undefined))).toEqual([{ id: '@c:x.org', label: 'Cleo' }])
    expect(mentionPills({ 'm.mentions': { user_ids: ['@d:x.org'] } }, () => undefined)).toEqual([])
  })
  it('ignores links that are not people and ids that could carry markup', () => {
    expect(mentionPills(html('<a href="https://matrix.to/#/#room:x.org">the room</a> <a href="https://example.com">site</a>'), () => 'N')).toEqual([])
    expect(mentionPills(html('<a href="https://matrix.to/#/@a&quot;onmouseover=alert(1):x.org">Eve</a>'), () => undefined)).toEqual([])
    expect(mentionPills({ 'm.mentions': { user_ids: ['@x"><img src=x onerror=1>:y.org'] } }, () => 'Mallory')).toEqual([])
  })
})
