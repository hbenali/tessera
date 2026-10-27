import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn, upload } from './lib.mjs'

const here = new URL('.', import.meta.url).pathname

describe('presence, delivery and typing', () => {
  let server, browser, data, a, b

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    // Alice has a profile picture so the signed-in user's avatar has something to load.
    const mxc = await upload(data.alice, `${here}../public/icon-512.png`, 'image/png')
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/profile/${data.alice.id}/avatar_url`, { avatar_url: mxc })
    a = await open(data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  async function open(user) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await ctx.newPage()
    await signIn(page, server.url, user)
    await page.getByRole('button', { name: /e2e room/ }).first().click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    return { ctx, page }
  }

  it('loads the signed-in user avatar and name in the sidebar', async () => {
    await a.page.waitForFunction(() => !!document.querySelector('footer .me img'), null, { timeout: 15_000 })
    const w = await a.page.evaluate(() => document.querySelector('footer .me img').naturalWidth)
    assert.ok(w > 0)
  })

  it('marks my newest message as seen once the other person reads it', async () => {
    const mine = a.page.locator('article', { hasText: `thanks ${data.bob.id}` }).or(a.page.locator('article', { hasText: 'thanks' }).last())
    const tick = mine.last().locator('.tick')
    await tick.waitFor({ timeout: 10_000 })
    assert.match(await tick.getAttribute('title'), /Sent|Seen/)
    b = await open(data.bob) // opening the room sends bob's read receipt
    await a.page.waitForFunction(() => document.querySelector('article:last-of-type .tick')?.title?.startsWith('Seen'), null, { timeout: 20_000 })
    assert.ok(await a.page.locator('.seen').count())
  })

  it('shows who is online, and updates when they go away or invisible', async () => {
    const dot = () => a.page.locator('article:not(.cont) .dot').first()
    await a.page.waitForFunction(() => document.querySelector('article .dot.online'), null, { timeout: 30_000 })
    assert.equal(await dot().getAttribute('title'), 'Online')
    await b.page.locator('footer .me').click()
    await b.page.getByRole('menuitemradio', { name: 'Away' }).click()
    await a.page.waitForFunction(() => document.querySelector('article .dot.unavailable'), null, { timeout: 30_000 })
    await b.page.locator('footer .me').click()
    await b.page.getByRole('menuitemradio', { name: 'Invisible' }).click()
    await a.page.waitForFunction(() => !document.querySelector('article .dot.online') && !document.querySelector('article .dot.unavailable'), null, { timeout: 30_000 })
    await b.page.locator('footer .me').click()
    await b.page.getByRole('menuitemradio', { name: 'Online' }).click()
    await a.page.waitForFunction(() => document.querySelector('article .dot.online'), null, { timeout: 30_000 })
  })

  it('changes my own status, tells the server and remembers it after a reload', async () => {
    await a.page.locator('footer .me').click()
    await a.page.getByRole('menuitemradio', { name: 'Away' }).click()
    assert.match(await a.page.locator('footer .me').innerText(), /Away/)
    await a.page.waitForTimeout(1500)
    const s = await api(data.alice.token, 'GET', `/_matrix/client/v3/presence/${encodeURIComponent(data.alice.id)}/status`)
    assert.equal(s.presence, 'unavailable')
    await a.page.reload()
    await a.page.getByRole('navigation', { name: 'Rooms' }).waitFor()
    assert.match(await a.page.locator('footer .me').innerText(), /Away/)
    await a.page.getByRole('button', { name: /e2e room/ }).first().click()
    await a.page.locator('footer .me').click()
    await a.page.getByRole('menuitemradio', { name: 'Online' }).click()
  })

  it('shows typing in the room and in the conversation list', async () => {
    await b.page.getByRole('combobox', { name: 'Message' }).pressSequentially('typing now', { delay: 40 })
    await a.page.getByText(/is typing/).waitFor({ timeout: 15_000 })
    assert.match(await a.page.locator('main .typing').innerText(), /bob_\w+ is typing/)
    await a.page.locator('nav .row .typing').waitFor({ timeout: 5_000 })
    await b.page.getByRole('combobox', { name: 'Message' }).fill('')
  })

  it('shows sending and failed states instead of a tick while a message is not delivered', async () => {
    await a.ctx.setOffline(true)
    await a.page.getByRole('combobox', { name: 'Message' }).fill('offline message')
    await a.page.keyboard.press('Enter')
    await a.page.locator('article', { hasText: 'offline message' }).locator('.tick.st-sending, .tick.st-failed').waitFor({ timeout: 10_000 })
    await a.ctx.setOffline(false)
  })
})
