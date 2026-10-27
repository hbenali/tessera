import { afterEach, describe, expect, it, vi } from 'vitest'
import { discover, loginOptions } from './discover'

const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
afterEach(() => vi.unstubAllGlobals())

describe('homeserver discovery', () => {
  it('uses a full URL as typed and trims trailing slashes', async () => {
    expect(await discover('http://localhost:8008/')).toBe('http://localhost:8008')
  })

  it('resolves a bare domain through .well-known', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ 'm.homeserver': { base_url: 'https://matrix.example.org/' } })))
    expect(await discover('example.org')).toBe('https://matrix.example.org')
  })

  it('ignores a non-http well-known value and falls back to the domain', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ 'm.homeserver': { base_url: 'javascript:alert(1)' } })))
    expect(await discover('example.org')).toBe('https://example.org')
  })

  it('reads password and SSO flows', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ flows: [{ type: 'm.login.password' }, { type: 'm.login.sso', identity_providers: [{ id: 'g', name: 'Google' }] }] })))
    expect(await loginOptions('http://hs')).toEqual({ baseUrl: 'http://hs', password: true, sso: [{ id: 'g', name: 'Google' }] })
  })

  it('offers a generic SSO button when the server lists no providers', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ flows: [{ type: 'm.login.sso' }] })))
    const o = await loginOptions('http://hs')
    expect(o.password).toBe(false)
    expect(o.sso).toEqual([{ id: '', name: 'Single sign-on' }])
  })
})
