import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, signIn } from './lib.mjs'

describe('search', () => {
  let server, browser, data, page
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('finds a message older than anything loaded, through the homeserver', async () => {
    await page.keyboard.press('Control+k')
    const box = page.getByRole('textbox', { name: 'Search rooms and messages' })
    const asked = page.waitForRequest((r) => r.url().includes('/_matrix/client/v3/search') && r.method() === 'POST')
    await box.fill('older message 7')
    await asked
    const hit = page.getByRole('option', { name: /older message 7/ })
    await hit.waitFor({ timeout: 15_000 })
    assert.match(await hit.innerText(), new RegExp(data.bob.name))
    assert.ok(await page.getByText(/Encrypted rooms cannot be searched by the server/).isVisible())
  })

  it('opens the room and brings that old message into view', async () => {
    await page.getByRole('option', { name: /older message 7/ }).click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll('article')].find((a) => a.querySelector('.text')?.textContent.trim() === 'older message 7')
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < innerHeight
    }, null, { timeout: 30_000 })
  })

  it('still finds recent messages on this device when nothing matches on the server', async () => {
    await page.keyboard.press('Control+k')
    await page.getByRole('textbox', { name: 'Search rooms and messages' }).fill('hello bob')
    await page.getByRole('option', { name: /hello bob/ }).waitFor({ timeout: 15_000 })
    await page.keyboard.press('Escape')
  })
})
