import { describe, expect, it } from 'vitest'
import { mentionsUser } from './mentions'

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
