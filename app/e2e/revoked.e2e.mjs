import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { SYNAPSE, api, app, launch, seed, signIn } from './lib.mjs'

describe('a session ended by the server', () => {
  let server, browser, data, page
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('returns to the sign-in page with a notice, and forgets the dead account', async () => {
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('tessera.session')).accessToken)
    const r = await fetch(`${SYNAPSE}/_matrix/client/v3/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
    assert.ok(r.ok)
    await page.getByText(/You were signed out/).waitFor({ timeout: 60_000 })
    assert.equal(await page.evaluate(() => localStorage.getItem('tessera.session')), null)
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tessera.accounts') ?? '[]').length), 0)
    await api(data.alice.token, 'GET', '/_matrix/client/v3/account/whoami') // the other device is untouched
  })
})
