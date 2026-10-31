import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

describe('mark as unread and mark all as read', () => {
  let server, browser, data, page, other
  const enc = encodeURIComponent
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const row = (re) => rooms().getByRole('button', { name: re }).first()
  const flag = () => api(data.alice.token, 'GET', `/_matrix/client/v3/user/${enc(data.alice.id)}/rooms/${enc(data.room)}/account_data/m.marked_unread`).catch(() => ({}))

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    other = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'second room', invite: [data.bob.id], preset: 'private_chat' })).room_id
    await api(data.bob.token, 'POST', `/_matrix/client/v3/join/${enc(other)}`, {})
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await row(/e2e room/).click() // read it, so it starts with nothing unread
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    await page.waitForFunction(() => ![...document.querySelectorAll('nav .row')].some((r) => /e2e room/.test(r.textContent) && r.querySelector('.badge')), null, { timeout: 15_000 })
    await row(/second room/).click() // look at a room that is not the one under test
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('marks a read room as unread, shown in the Unread view, and opening it clears the flag', async () => {
    await row(/e2e room/).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Mark as unread' }).click()
    await row(/e2e room/).getByText('Marked as unread').waitFor({ timeout: 15_000 })
    assert.equal((await flag()).unread, true)
    await page.locator('aside header .switch').click()
    await page.getByRole('option', { name: /^Unread/ }).click()
    await row(/e2e room/).waitFor()
    await row(/e2e room/).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('nav .row')].some((r) => /Marked as unread/.test(r.textContent)), null, { timeout: 15_000 })
    for (let i = 0; i < 30 && (await flag()).unread !== false; i++) await new Promise((r) => setTimeout(r, 300))
    assert.equal((await flag()).unread, false)
  })

  it('marks every unread room as read from the view menu', async () => {
    await page.locator('aside header .switch').click()
    await page.getByRole('option', { name: /^All conversations/ }).click()
    await row(/second room/).click() // leave e2e room, so new messages there are unread
    await send(data.bob, data.room, { msgtype: 'm.text', body: 'unread a' })
    await send(data.bob, data.room, { msgtype: 'm.text', body: 'unread b' })
    await row(/e2e room/).locator('.badge').waitFor({ timeout: 15_000 })
    await page.locator('aside header .switch').click()
    await page.getByRole('option', { name: /Mark all as read/ }).click()
    await page.waitForFunction(() => document.querySelectorAll('nav .row .badge').length === 0, null, { timeout: 20_000 })
    assert.equal(await page.locator('nav .row.unread').count(), 0)
  })
})
