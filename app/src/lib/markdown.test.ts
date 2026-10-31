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

describe('mentions', () => {
  const names = { name: (id: string) => (id === '@alice:localhost' ? 'Alice' : undefined), me: '@alice:localhost' }
  it('renders a user id as a pill with the display name and flags me', () => {
    const out = render('hi @alice:localhost and @bob:localhost', names)
    expect(out).toContain('<span class="mention me" data-user="@alice:localhost" role="button" tabindex="0" aria-haspopup="dialog" title="@alice:localhost"><i style="background:var(--t')
    expect(out).toContain('<span class="mention" data-user="@bob:localhost" role="button" tabindex="0" aria-haspopup="dialog" title="@bob:localhost"><i style="background:var(--t')
  })
  it('escapes display names and leaves code and links alone', () => {
    expect(render('@x:y', { name: () => '<img src=x onerror=1>' })).not.toContain('<img')
    expect(render('`@alice:localhost`', names)).toBe('<code>@alice:localhost</code>')
    expect(render('https://e.com/@alice:localhost', names)).not.toContain('class="mention"')
  })
})

describe('mentions by name', () => {
  const pills = [{ id: '@samuel:exo.test', label: 'Samuel Renault' }]
  it('draws the name as a pill, with or without an @', () => {
    const out = render('Je vais partager la clé avec  Samuel Renault', { pills })
    expect(out).toContain('data-user="@samuel:exo.test"')
    expect(out).toContain('@Samuel Renault</span>')
    expect(render('hi @Samuel Renault!', { pills })).toContain('data-user="@samuel:exo.test"')
  })
  it('does not touch part of a longer word, and marks the pill for me', () => {
    expect(render('Samuel Renaulty', { pills })).not.toContain('class="mention')
    expect(render('x Samuel Renault', { pills, me: '@samuel:exo.test' })).toContain('class="mention me"')
  })
  it('escapes the label, so a crafted name cannot add markup', () => {
    const out = render('hi <img src=x onerror=1>', { pills: [{ id: '@a:x.org', label: '<img src=x onerror=1>' }] })
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})

describe('placeholder injection', () => {
  it('a message containing the renderer\'s own placeholder cannot pull in other output', () => {
    const out = render('`code` and \u00000\u0000 and \u00009\u0000')
    expect(out).not.toContain('undefined')
    expect(out.match(/<code>code<\/code>/g)).toHaveLength(1)
  })
})
