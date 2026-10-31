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
})
