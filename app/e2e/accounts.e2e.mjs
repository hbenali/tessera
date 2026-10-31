import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PASSWORD, SYNAPSE, app, launch, seed, signIn } from './lib.mjs'

describe('several accounts, one at a time', () => {
  let server, browser, data, page
  const me = () => page.locator('footer .me')
  const menu = () => page.locator('footer .me').click()
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

  it('adds a second account from the status menu and can go back without signing in again', async () => {
    await me().waitFor()
    await menu()
    await page.getByRole('menuitem', { name: 'Add an account' }).click()
    await page.getByRole('button', { name: /Back to/ }).waitFor()
    await page.getByLabel('Homeserver').fill(SYNAPSE)
    await page.getByLabel('Username').fill(data.bob.name)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor({ timeout: 30_000 })
    assert.match(await me().innerText(), /bob_/)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tessera.accounts')).map((a) => a.userId))
    assert.deepEqual(saved.sort(), [data.alice.id, data.bob.id].sort())
  })

  it('switches between the accounts', async () => {
    await menu()
    await page.getByRole('menuitem', { name: /Switch to/ }).click()
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor({ timeout: 30_000 })
    assert.match(await me().innerText(), /alice_/)
    await menu()
    await page.getByRole('menuitem', { name: /Switch to .*bob/ }).waitFor()
    await page.keyboard.press('Escape')
  })

  it('signing out one account carries on with the other', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: 'Settings' })
    await dlg.getByRole('tab', { name: 'Account' }).click()
    await dlg.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.waitForFunction(() => /bob_/.test(document.querySelector('footer .me')?.textContent ?? ''), null, { timeout: 30_000 })
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tessera.accounts')).map((a) => a.userId))
    assert.deepEqual(saved, [data.bob.id])
  })
})
