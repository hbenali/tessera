import { describe, expect, it } from 'vitest'
import { render } from './markdown'

describe('markdown render', () => {
  it('escapes raw HTML', () => {
    expect(render('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(render('<script>alert(1)</script>')).not.toContain('<script>')
  })

  it('cannot break out of an attribute through a link', () => {
    const out = render('https://a.test/"onmouseover="alert(1)')
    // The quote stays escaped inside href, so no extra attribute can appear.
    expect(out).toContain('&quot;onmouseover=&quot;')
    expect(out.match(/<a [^>]*>/)![0]).not.toMatch(/"\s+on\w+=/)
    expect(out.match(/="/g)!.length).toBe(3) // href, target, rel only
  })

  it('does not turn javascript: URLs into links', () => {
    expect(render('javascript:alert(1)')).not.toContain('<a ')
  })

  it('opens links safely', () => {
    expect(render('see https://example.org/x.')).toContain('rel="noopener noreferrer nofollow"')
  })

  it('keeps code content literal and escaped', () => {
    expect(render('```\n<b>**no**</b>\n```')).toBe('<pre><code>&lt;b&gt;**no**&lt;/b&gt;</code></pre>')
    expect(render('`<i>`')).toBe('<code>&lt;i&gt;</code>')
  })

  it('renders basic inline formatting', () => {
    expect(render('**b** *i* ~~s~~')).toBe('<strong>b</strong> <em>i</em> <del>s</del>')
  })
})
