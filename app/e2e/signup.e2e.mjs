import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PASSWORD, SYNAPSE, app, launch } from './lib.mjs'

describe('creating an account from the sign-in page', () => {
  let server, browser, page
  before(async () => {
    server = await app()
    browser = await launch()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('signs up on an open homeserver and lands in the app', async () => {
    const name = `new_${Math.random().toString(36).slice(2, 8)}`
    await page.goto(server.url)
    await page.getByLabel('Homeserver').fill(SYNAPSE)
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByRole('heading', { name: 'Create an account' }).waitFor()
    await page.getByLabel('Username').fill(name)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Repeat the password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor({ timeout: 30_000 })
    const r = await fetch(`${SYNAPSE}/_matrix/client/v3/profile/${encodeURIComponent(`@${name}:localhost`)}`)
    assert.ok(r.ok)
  })

  it('refuses mismatched passwords and a taken name', async () => {
    const taken = `taken_${Math.random().toString(36).slice(2, 8)}`
    await fetch(`${SYNAPSE}/_matrix/client/v3/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: taken, password: PASSWORD, auth: { type: 'm.login.dummy' } }) })
    const fresh = await (await browser.newContext()).newPage()
    await fresh.goto(server.url)
    await fresh.getByLabel('Homeserver').fill(SYNAPSE)
    await fresh.getByRole('button', { name: 'Create an account' }).click()
    await fresh.getByLabel('Username').fill(taken)
    await fresh.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await fresh.getByLabel('Repeat the password').fill('something else 1')
    await fresh.getByRole('button', { name: 'Create account' }).click()
    await fresh.getByText('The passwords differ').waitFor()
    await fresh.getByLabel('Repeat the password').fill(PASSWORD)
    await fresh.getByRole('button', { name: 'Create account' }).click()
    await fresh.getByText('That user name is taken').waitFor({ timeout: 15_000 })
  })

  it('does not show sign-in options of a server you have already moved away from', async () => {
    const slow = await (await browser.newContext()).newPage()
    // a homeserver that offers single sign-on and answers late
    await slow.route('http://slow.test:8008/_matrix/client/v3/login', async (route) => {
      await new Promise((r) => setTimeout(r, 2500))
      await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ flows: [{ type: 'm.login.sso', identity_providers: [{ id: 'x', name: 'Slow IdP' }] }] }) })
    })
    await slow.goto(server.url)
    await slow.getByLabel('Homeserver').fill('http://slow.test:8008')
    await slow.waitForTimeout(800) // the probe for the slow server is now in flight
    await slow.getByLabel('Homeserver').fill(SYNAPSE)
    await slow.waitForTimeout(3500) // the slow answer arrives after the change
    assert.equal(await slow.getByRole('button', { name: /Slow IdP/ }).count(), 0)
    await slow.getByRole('button', { name: 'Continue', exact: true }).waitFor()
  })
})
