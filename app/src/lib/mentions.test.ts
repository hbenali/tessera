import { describe, expect, it } from 'vitest'
import { mentionsUser, plainMentions } from './mentions'

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
