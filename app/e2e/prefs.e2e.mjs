import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('keywords, low priority and message density', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const dlg = () => page.getByRole('dialog', { name: 'Settings' })
  const rules = () => api(data.alice.token, 'GET', '/_matrix/client/v3/pushrules/').then((r) => r.global.content ?? [])

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

  it('adds and removes a notification keyword as a standard push rule', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await dlg().getByRole('tab', { name: 'Notifications' }).click()
    await dlg().getByLabel('New keyword').fill('x')
    await dlg().getByRole('button', { name: 'Add', exact: true }).click()
    await dlg().getByText('Use at least 2 characters').waitFor()
    await dlg().getByLabel('New keyword').fill('Deploy Now')
    await dlg().getByRole('button', { name: 'Add', exact: true }).click()
    await dlg().getByRole('button', { name: 'Remove keyword deploy now' }).waitFor()
    const rule = (await rules()).find((r) => r.rule_id === 'tessera.kw.deploy%20now')
    assert.equal(rule?.pattern, 'deploy now')
    assert.ok(rule.actions.includes('notify'))
    await dlg().getByRole('button', { name: 'Remove keyword deploy now' }).click()
    await dlg().getByRole('button', { name: 'Remove keyword deploy now' }).waitFor({ state: 'detached' })
    assert.equal((await rules()).some((r) => r.rule_id.startsWith('tessera.kw.')), false)
  })

  it('switches density and text size, remembered after a reload', async () => {
    await dlg().getByRole('tab', { name: 'Appearance' }).click()
    await dlg().getByRole('radio', { name: 'Compact' }).click()
    await dlg().getByRole('radio', { name: 'Large text' }).click()
    assert.equal(await page.evaluate(() => document.documentElement.dataset.density + '/' + document.documentElement.dataset.textsize), 'compact/large')
    await page.reload()
    await rooms().waitFor({ timeout: 30_000 })
    assert.equal(await page.evaluate(() => document.documentElement.dataset.density + '/' + document.documentElement.dataset.textsize), 'compact/large')
    await page.evaluate(() => { localStorage.removeItem('tessera.density'); localStorage.removeItem('tessera.textsize') })
  })

  it('moves a low-priority room below the others and tags it for other clients', async () => {
    const second = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'newer room', preset: 'private_chat' })).room_id
    await rooms().getByRole('button', { name: /newer room/ }).first().waitFor({ timeout: 15_000 })
    await rooms().getByRole('button', { name: /newer room/ }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Low priority' }).click()
    await page.waitForFunction(() => { const names = [...document.querySelectorAll('nav .row .name')].map((n) => n.textContent); return names.at(-1) === 'newer room' }, null, { timeout: 15_000 })
    const tags = await api(data.alice.token, 'GET', `/_matrix/client/v3/user/${enc(data.alice.id)}/rooms/${enc(second)}/tags`)
    assert.ok(tags.tags['m.lowpriority'])
  })
})
