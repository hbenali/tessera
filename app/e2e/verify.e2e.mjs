import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { app, launch, PASSWORD, register, signIn } from './lib.mjs'

// Two sessions of one account verify each other: the second scans a screenshot of the first one's QR code.
// A real camera is not exercised: that needs a device and permission.
describe('device verification by QR code', () => {
  let server, browser, user, a, b

  before(async () => {
    server = await app()
    browser = await launch()
    user = await register(`qr_${Math.random().toString(36).slice(2, 8)}`)
    a = await open()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  async function open() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await signIn(page, server.url, user)
    return { ctx, page }
  }
  async function settings(page) {
    await page.locator('footer .me').click()
    await page.getByRole('menuitem', { name: 'Profile and settings' }).click()
    await page.getByRole('tab', { name: 'Security' }).click()
  }

  it('sets up cross-signing on the first session', async () => {
    await settings(a.page)
    await a.page.getByPlaceholder('Account password').fill(PASSWORD)
    await a.page.getByRole('button', { name: 'Set up', exact: true }).click()
    await a.page.getByRole('button', { name: 'I have saved it' }).click({ timeout: 60_000 })
    await a.page.getByText('This session is verified.').waitFor({ timeout: 30_000 })
    await a.page.keyboard.press('Escape')
  })

  it('shows a QR code on both sessions once the request is accepted', async () => {
    b = await open()
    await settings(b.page)
    await b.page.getByRole('button', { name: 'Start verification' }).click()
    await a.page.getByRole('button', { name: 'Accept' }).click({ timeout: 30_000 })
    for (const s of [a, b]) {
      await s.page.getByRole('img', { name: /QR code/ }).waitFor({ timeout: 30_000 })
      await s.page.getByRole('button', { name: 'Compare emoji instead' }).waitFor()
    }
  })

  it('verifies when the other session scans the code from an image', async () => {
    const png = await a.page.waitForFunction(() => {
      const c = document.querySelector('[role=img][aria-label*="QR code"] canvas')
      return c && c.width > 50 ? c.toDataURL('image/png') : null
    }).then((h) => h.jsonValue())
    const buf = Buffer.from(png.split(',')[1], 'base64')
    await b.page.locator('input[type=file][accept="image/*"]').last().setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: buf })
    // The scanned session now asks the person to confirm on the session that showed the code.
    await a.page.getByRole('button', { name: 'Yes, it did' }).click({ timeout: 30_000 })
    for (const s of [a, b]) await s.page.getByText('Verified.', { exact: true }).waitFor({ timeout: 30_000 })
    await b.page.getByRole('button', { name: 'Done' }).click()
    await b.page.getByText('This session is verified.').waitFor({ timeout: 30_000 })
  })

  it('says so when an image holds no QR code', async () => {
    const c = await open()
    await settings(c.page)
    await c.page.getByRole('button', { name: 'Start verification' }).click()
    await a.page.getByRole('button', { name: 'Accept' }).click({ timeout: 30_000 }).catch(() => {})
    await c.page.getByRole('button', { name: 'Use a screenshot' }).waitFor({ timeout: 30_000 })
    const blank = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    await c.page.locator('input[type=file][accept="image/*"]').last().setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: blank })
    await c.page.getByRole('alert').filter({ hasText: 'No QR code was found' }).waitFor()
  })

  it('still verifies by comparing emoji', async () => {
    await a.page.keyboard.press('Escape') // drop the previous test's request
    const d = await open()
    await settings(d.page)
    await d.page.getByRole('button', { name: 'Start verification' }).click()
    await a.page.getByRole('button', { name: 'Accept' }).click({ timeout: 30_000 })
    await d.page.getByRole('button', { name: 'Compare emoji instead' }).click({ timeout: 30_000 })
    const seen = []
    for (const s of [a, d]) {
      await s.page.getByText('Check that these symbols match').waitFor({ timeout: 60_000 })
      seen.push(await s.page.locator('.emoji').innerText())
    }
    assert.equal(seen[0], seen[1])
    for (const s of [a, d]) await s.page.getByRole('button', { name: 'They match' }).click()
    for (const s of [a, d]) await s.page.getByText('Verified.', { exact: true }).waitFor({ timeout: 30_000 })
  })
})
