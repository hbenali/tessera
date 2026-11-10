import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('expanded message box and hidden room list', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const composer = () => page.getByRole('combobox', { name: 'Message' })
  const height = () => composer().evaluate((e) => e.getBoundingClientRect().height)
  const newest = async () => (await api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(data.room)}/messages?dir=b&limit=10`)).chunk.find((e) => e.type === 'm.room.message' && e.sender === data.alice.id)?.content.body
  // The message shows at once and reaches the server a moment later.
  const arrives = async (body) => { for (let i = 0; i < 40 && (await newest()) !== body; i++) await new Promise((r) => setTimeout(r, 150)); return newest() }
  const open = async () => {
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await page.locator('article').filter({ hasText: 'thanks' }).last().waitFor()
  }

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await open()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('expands into a tall editor where Enter writes a new line and Ctrl+Enter sends', async () => {
    await composer().click()
    const small = await height()
    const btn = page.getByRole('button', { name: 'Expand the message box' })
    await btn.click()
    assert.equal(await page.getByRole('button', { name: 'Shrink the message box' }).getAttribute('aria-pressed'), 'true')
    assert.ok((await height()) >= 120 && (await height()) > small + 60, `the box is ${await height()}px, was ${small}px`)
    assert.match(await page.locator('.hint').innerText(), /Ctrl\+Enter to send/)
    const before = await newest()
    await composer().fill('line one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('line two')
    assert.equal(await composer().inputValue(), 'line one\nline two', 'Enter wrote a new line')
    await page.waitForTimeout(300)
    assert.equal(await newest(), before, 'Enter did not send')
    await page.keyboard.press('Control+Enter')
    await page.locator('article').filter({ hasText: 'line two' }).last().waitFor()
    assert.equal(await arrives('line one\nline two'), 'line one\nline two')
    assert.equal(await composer().inputValue(), '')
  })

  it('shrinks back, and Enter sends again', async () => {
    await page.getByRole('button', { name: 'Shrink the message box' }).click()
    assert.ok((await height()) < 100, `the box is still ${await height()}px`)
    assert.match(await page.locator('.hint').innerText(), /Enter to send · Shift\+Enter/)
    await composer().fill('quick one')
    await page.keyboard.press('Enter')
    await page.locator('article').filter({ hasText: 'quick one' }).last().waitFor()
    assert.equal(await arrives('quick one'), 'quick one')
  })

  it('keeps the newest message in view while the box grows and shrinks', async () => {
    await composer().click()
    await page.getByRole('button', { name: 'Expand the message box' }).click()
    await page.waitForTimeout(300)
    const hidden = () => page.evaluate(() => { const s = document.querySelector('.scroll'); const last = [...s.querySelectorAll('article')].at(-1); return Math.round(last.getBoundingClientRect().bottom - s.getBoundingClientRect().bottom) })
    assert.ok((await hidden()) <= 1, `expanding hid the newest message by ${await hidden()}px`)
    await page.getByRole('button', { name: 'Shrink the message box' }).click()
  })

  it('hides the room list to give the chat the whole width, and remembers it', async () => {
    const side = page.locator('aside.sidebar')
    assert.ok(await side.isVisible())
    await page.getByRole('button', { name: 'Hide the room list' }).click()
    assert.equal(await side.isVisible(), false)
    assert.ok((await page.locator('main.main').boundingBox()).width > 1200)
    await page.reload()
    await page.locator('article').filter({ hasText: 'thanks' }).last().waitFor()
    assert.equal(await page.locator('aside.sidebar').isVisible(), false, 'still hidden after a reload')
    await page.getByRole('button', { name: 'Show the room list' }).click()
    assert.ok(await page.locator('aside.sidebar').isVisible())
  })

  it('toggles the room list with Ctrl+\\', async () => {
    await page.keyboard.press('Control+\\')
    assert.equal(await page.locator('aside.sidebar').isVisible(), false)
    await page.keyboard.press('Control+\\')
    assert.ok(await page.locator('aside.sidebar').isVisible())
  })

  it('keeps the room list with a side panel open on a wide window, and has no toggle on a phone', async () => {
    await page.getByRole('button', { name: 'Hide the room list' }).click()
    await page.getByRole('button', { name: 'Shared media' }).click()
    await page.getByRole('complementary', { name: 'Shared media' }).waitFor()
    assert.equal(await page.locator('aside.sidebar').isVisible(), false)
    assert.ok((await page.locator('main.main').boundingBox()).width > 900)
    await page.getByRole('complementary', { name: 'Shared media' }).getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Show the room list' }).click()
    await page.setViewportSize({ width: 390, height: 800 })
    assert.equal(await page.getByRole('button', { name: /room list/ }).isVisible(), false)
    await page.setViewportSize({ width: 1280, height: 800 })
  })
})
