import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('url routing', () => {
  let server, browser, data, ctx, page, other
  const enc = encodeURIComponent

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    const r = await api(data.bob.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'open house', preset: 'public_chat' })
    other = r.room_id
    ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.url })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  const hash = () => page.evaluate(() => location.hash)

  it('puts the open room in the address bar', async () => {
    await page.getByRole('button', { name: /e2e room/ }).click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    assert.equal(await hash(), `#/room/${enc(data.room)}`)
  })

  it('reopens the room from the address bar after a reload', async () => {
    await page.reload()
    await page.getByRole('combobox', { name: 'Message' }).waitFor({ timeout: 30_000 })
    assert.equal(await page.locator('main header h1').innerText(), 'e2e room')
  })

  it('follows the browser Back and Forward buttons', async () => {
    await page.getByRole('button', { name: /sparse|open house|e2e room/ }).first().waitFor()
    // a second room: bob invites nobody, so use the public one through its link
    await page.evaluate((h) => { location.hash = h }, `#/room/${enc(other)}`)
    await page.getByRole('heading', { name: 'You are not in this room' }).waitFor()
    await page.goBack()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    assert.equal(await page.locator('main header h1').innerText(), 'e2e room')
    await page.goForward()
    await page.getByRole('heading', { name: 'You are not in this room' }).waitFor()
  })

  it('offers to join a room named in the link, then opens it', async () => {
    await page.getByRole('button', { name: 'Join room' }).click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor({ timeout: 15_000 })
    assert.equal(await page.locator('main header h1').innerText(), 'open house')
    assert.equal(await hash(), `#/room/${enc(other)}`)
  })

  it('ignores a malformed link instead of breaking', async () => {
    await page.evaluate(() => { location.hash = '#/room/%zz' })
    await page.getByRole('heading', { name: 'Select a conversation' }).waitFor()
    await page.evaluate(() => { location.hash = '#/room/javascript:alert(1)' })
    await page.getByRole('heading', { name: 'Select a conversation' }).waitFor()
  })

  it('copies a link to a message and that link scrolls to it', async () => {
    await page.getByRole('button', { name: /e2e room/ }).click()
    const row = page.locator('article', { hasText: 'first message from bob' })
    await row.waitFor({ timeout: 15_000 }).catch(async () => {
      // older than the first window: load it by scrolling up
      await page.locator('.scroll').evaluate((el) => { el.scrollTop = 0 })
      await row.waitFor({ timeout: 15_000 })
    })
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForFunction(() => !document.querySelector('.sentinel')?.textContent?.trim())
    await row.hover()
    await row.getByRole('button', { name: 'Copy link to message' }).click()
    await page.getByText('Link copied').waitFor()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    assert.match(link, new RegExp(`#/room/${enc(data.room).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/%24`))

    const fresh = await ctx.newPage()
    await fresh.goto(link)
    await fresh.getByRole('combobox', { name: 'Message' }).waitFor({ timeout: 30_000 })
    await fresh.waitForFunction(() => {
      const el = [...document.querySelectorAll('article')].find((a) => a.textContent.includes('first message from bob'))
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= innerHeight
    }, null, { timeout: 15_000 })
  })
})
