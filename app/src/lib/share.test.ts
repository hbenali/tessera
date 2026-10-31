import { describe, expect, it } from 'vitest'
import { readShare, withoutShare } from './share'

describe('share target', () => {
  it('joins title, text and link, without repeating the link', () => {
    expect(readShare('?share=1&title=Cool&text=Look%20at%20this&url=https%3A%2F%2Fa.b%2Fc')).toBe('Cool\nLook at this\nhttps://a.b/c')
    expect(readShare('?share=1&text=See%20https%3A%2F%2Fa.b%2Fc&url=https%3A%2F%2Fa.b%2Fc')).toBe('See https://a.b/c')
  })
  it('ignores a page that was not opened by a share, and an empty share', () => {
    expect(readShare('?room=1')).toBeUndefined()
    expect(readShare('?share=1')).toBeUndefined()
  })
  it('limits very long text', () => expect(readShare('?share=1&text=' + 'a'.repeat(9000))!.length).toBe(4000))
  it('removes the share parameters and keeps the rest', () => {
    expect(withoutShare('https://x.y/?share=1&title=a&text=b&url=c&keep=1#/room/!a')).toBe('/?keep=1#/room/!a')
    expect(withoutShare('https://x.y/?share=1')).toBe('/')
  })
})
