import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, signIn } from './lib.mjs'

describe('the newest message stays visible', () => {
  let server, browser, page
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const composer = () => page.getByRole('combobox', { name: 'Message' })
  // How far the end of the list is below what can be seen: 0 means the newest message is fully in view.
  const hidden = () => page.evaluate(() => {
    const s = document.querySelector('.scroll')
    const last = [...s.querySelectorAll('article')].at(-1)
    return Math.round(last.getBoundingClientRect().bottom - s.getBoundingClientRect().bottom)
  })

  before(async () => {
    server = await app()
    browser = await launch()
    const data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await page.locator('article').filter({ hasText: 'thanks' }).last().waitFor()
    await page.waitForTimeout(500)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('is in view before anything is touched', async () => {
    assert.ok((await hidden()) <= 1, `hidden by ${await hidden()}px`)
  })

  it('stays in view when the message box is focused (its formatting bar appears)', async () => {
    await composer().click()
    await page.waitForTimeout(400)
    assert.ok((await hidden()) <= 1, `focusing the message box hid the newest message by ${await hidden()}px`)
  })

  it('stays in view when the window gets shorter, as with a phone keyboard', async () => {
    await page.setViewportSize({ width: 1280, height: 420 })
    await page.waitForTimeout(400)
    assert.ok((await hidden()) <= 1, `a shorter window hid the newest message by ${await hidden()}px`)
    await page.setViewportSize({ width: 1280, height: 800 })
  })

  it('does not drag a reader who scrolled up back to the bottom', async () => {
    // 600px above the bottom (measured from the bottom: the list's height settles as rows render, so a fixed top is not stable).
    const gap = () => page.evaluate(() => { const s = document.querySelector('.scroll'); return s.scrollHeight - s.clientHeight - s.scrollTop })
    await page.waitForTimeout(600) // let the window settle after the previous test
    const box = await page.locator('.scroll').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(500)
    assert.ok((await gap()) >= 400, 'the reader scrolled up')
    await composer().click()
    await page.setViewportSize({ width: 1280, height: 500 })
    await page.waitForTimeout(400)
    const after = await gap()
    assert.ok(after >= 500, `the reader was dragged to ${after}px from the bottom`)
    await page.setViewportSize({ width: 1280, height: 800 })
  })
})
