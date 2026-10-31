import { describe, expect, it } from 'vitest'
import { firstUrl, isPrivateHost, toPreview } from './linkpreview'

describe('firstUrl', () => {
  it('finds a link and drops sentence punctuation', () => {
    expect(firstUrl('see https://example.com/a?b=1, ok')).toBe('https://example.com/a?b=1')
    expect(firstUrl('(https://example.com/x).')).toBe('https://example.com/x')
    expect(firstUrl('wiki https://en.wikipedia.org/wiki/Foo_(bar)')).toBe('https://en.wikipedia.org/wiki/Foo_(bar)')
  })
  it('skips private addresses and credentials, and takes the next public link', () => {
    expect(firstUrl('http://localhost:8008/x')).toBeUndefined()
    expect(firstUrl('http://192.168.1.5/admin https://example.org')).toBe('https://example.org/')
    expect(firstUrl('https://user:pw@example.com')).toBeUndefined()
    expect(firstUrl('no links here')).toBeUndefined()
  })
  it('knows private hosts', () => {
    for (const h of ['localhost', '10.0.0.1', '127.0.0.1', '172.20.1.1', 'nas.local', 'intranet', '[::1]']) expect(isPrivateHost(h)).toBe(true)
    for (const h of ['example.com', '172.32.0.1', '8.8.8.8']) expect(isPrivateHost(h)).toBe(false)
  })
})

describe('toPreview', () => {
  it('needs a title or description, and keeps only mxc images', () => {
    expect(toPreview('https://a.b/', {})).toBeUndefined()
    expect(toPreview('https://a.b/', { 'og:title': 'T', 'og:image': 'https://evil/x.png' })?.image).toBeUndefined()
    expect(toPreview('https://a.b/', { 'og:title': 'T', 'og:image': 'mxc://s/i' })).toMatchObject({ title: 'T', site: 'a.b', image: 'mxc://s/i' })
  })
})
