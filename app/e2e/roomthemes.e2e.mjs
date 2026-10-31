import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('room themes', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const scroll = () => page.locator('.scroll')
  const layoutOf = () => scroll().getAttribute('data-layout')
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const mine = () => page.locator('article.mine').first()
  const theirs = () => page.locator('article:not(.mine)').first()
  const roomTheme = () => api(data.alice.token, 'GET', `/_matrix/client/v3/user/${enc(data.alice.id)}/rooms/${enc(data.room)}/account_data/ovh.hbenali.tessera.room`).catch(() => ({}))
  const details = () => page.getByRole('complementary', { name: 'Room details' })

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    await page.locator('article.mine').first().waitFor({ timeout: 15_000 })
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('starts as Classic; the default can be changed in Settings', async () => {
    assert.equal(await layoutOf(), 'classic')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: 'Settings' })
    await dlg.getByRole('tab', { name: 'Appearance' }).click()
    await dlg.getByRole('radio', { name: 'Cards' }).click()
    await dlg.getByRole('button', { name: 'Close' }).click()
    assert.equal(await layoutOf(), 'cards')
    await page.reload()
    await page.locator('.scroll').waitFor({ timeout: 30_000 })
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    assert.equal(await layoutOf(), 'cards', 'the default is remembered')
  })

  it('a room can choose its own layout, which is kept in its account data', async () => {
    await page.getByRole('button', { name: 'Room details' }).click()
    await details().getByRole('radio', { name: 'Aligned' }).click()
    await page.waitForFunction(() => document.querySelector('.scroll')?.getAttribute('data-layout') === 'aligned')
    for (let i = 0; i < 30 && (await roomTheme()).layout !== 'aligned'; i++) await new Promise((r) => setTimeout(r, 250))
    assert.equal((await roomTheme()).layout, 'aligned')
  })

  it('Aligned puts my messages on the right and the others on the left', async () => {
    const box = await scroll().boundingBox()
    const m = await mine().locator('.text').first().boundingBox()
    const t = await theirs().locator('.text').first().boundingBox()
    assert.ok(m.x + m.width > box.x + box.width - 80, `my bubble ends at ${Math.round(m.x + m.width)} of ${Math.round(box.x + box.width)}`)
    assert.ok(t.x < box.x + 120, `their bubble starts at ${Math.round(t.x - box.x)}`)
    assert.equal(await mine().locator('.gutter').isVisible(), false, 'no avatar beside my own bubble')
  })

  it('Cards frame each message; Lines drop the avatars and keep a message on one line', async () => {
    await details().getByRole('radio', { name: 'Cards' }).click()
    await page.waitForFunction(() => document.querySelector('.scroll')?.getAttribute('data-layout') === 'cards')
    const border = await theirs().evaluate((e) => getComputedStyle(e).borderTopWidth)
    assert.equal(border, '1px')
    await details().getByRole('radio', { name: 'Lines' }).click()
    await page.waitForFunction(() => document.querySelector('.scroll')?.getAttribute('data-layout') === 'lines')
    assert.equal(await theirs().locator('.gutter').isVisible(), false)
    const h = await page.locator('article.cont').first().evaluate((e) => e.getBoundingClientRect().height)
    assert.ok(h < 32, `a short message is ${Math.round(h)}px tall`)
    // continuation rows still say who wrote them in this layout
    assert.ok(await page.locator('article.cont .head').first().isVisible())
  })

  it('an accent tints the room, and "use my default look" puts everything back', async () => {
    await details().getByRole('radio', { name: 'Rose' }).click()
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main.main')).getPropertyValue('--accent').trim() === '#c2306a')
    for (let i = 0; i < 30 && (await roomTheme()).accent !== 'rose'; i++) await new Promise((r) => setTimeout(r, 250))
    assert.equal((await roomTheme()).accent, 'rose')
    await details().getByRole('button', { name: 'Use my default look' }).click()
    await page.waitForFunction(() => document.querySelector('.scroll')?.getAttribute('data-layout') === 'cards')
    assert.equal(await page.evaluate(() => document.querySelector('main.main').style.getPropertyValue('--accent')), '')
    for (let i = 0; i < 30 && Object.keys(await roomTheme()).length > 0; i++) await new Promise((r) => setTimeout(r, 250))
    assert.deepEqual(await roomTheme(), {})
  })

  it('Lines gives way to Classic on a phone', async () => {
    await details().getByRole('radio', { name: 'Lines' }).click()
    await page.setViewportSize({ width: 390, height: 780 })
    await page.waitForFunction(() => document.querySelector('.scroll')?.getAttribute('data-layout') === 'classic')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForFunction(() => document.querySelector('.scroll')?.getAttribute('data-layout') === 'lines')
  })
})
