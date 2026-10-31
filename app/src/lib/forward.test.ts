import { describe, expect, it } from 'vitest'
import { forwardContent } from './forward'

describe('forwardContent', () => {
  it('drops replies, threads, edits, mentions and html', () => {
    const r = forwardContent({ msgtype: 'm.text', body: '> <@a:x> old\n\nnew', format: 'org.matrix.custom.html', formatted_body: '<mx-reply>x</mx-reply>new', 'm.relates_to': { 'm.in_reply_to': { event_id: '$e' } }, 'm.mentions': { user_ids: ['@a:x'] } }, true)
    expect(r).toEqual({ content: { msgtype: 'm.text', body: 'new' } })
  })
  it('does not put an encrypted file (and its key) into a room that is not encrypted', () => {
    const file = { msgtype: 'm.file', body: 'a.pdf', file: { url: 'mxc://x/y', key: { k: 'SECRET' } } }
    expect(forwardContent(file, false)).toMatchObject({ error: expect.stringMatching(/not encrypted/) })
    expect(forwardContent(file, true)).toHaveProperty('content.file.key.k', 'SECRET')
  })
  it('an unencrypted attachment goes anywhere', () => {
    expect(forwardContent({ msgtype: 'm.image', body: 'i.png', url: 'mxc://x/y' }, false)).toHaveProperty('content.url', 'mxc://x/y')
  })
})
