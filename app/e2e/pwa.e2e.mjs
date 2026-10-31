import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

describe('installed-app touches', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const badge = () => page.evaluate(() => window.__badge)
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    for (const t of ['one', 'two', 'three']) await send(data.bob, data.room, { msgtype: 'm.text', body: `unread ${t}` })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    // record what the app asks of the Badging API, and let a test play the part of the browser's launch queue
    await ctx.addInitScript(() => {
      window.__badge = { last: null, calls: [] }
      navigator.setAppBadge = (n) => { window.__badge.last = n; window.__badge.calls.push(n); return Promise.resolve() }
      navigator.clearAppBadge = () => { window.__badge.last = 0; window.__badge.calls.push(0); return Promise.resolve() }
      Object.defineProperty(window, 'launchQueue', { value: { setConsumer(f) { window.__launch = f } }, configurable: true })
    })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('puts the unread count on the app icon, leaves muted rooms out, and clears it as you read', async () => {
    await page.waitForFunction(() => window.__badge.last > 0, null, { timeout: 15_000 })
    await page.waitForTimeout(800)
    const first = (await badge()).last
    const shown = await page.evaluate(() => [...document.querySelectorAll('nav .row .badge')].reduce((n, b) => n + Number(b.textContent), 0))
    assert.equal(first, shown, 'the icon shows the same total as the room list')
    // a muted room adds nothing
    const quiet = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'quiet room', invite: [data.bob.id], preset: 'private_chat' })).room_id
    await api(data.bob.token, 'POST', `/_matrix/client/v3/join/${enc(quiet)}`, {})
    await rooms().getByRole('button', { name: /quiet room/ }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Mute', exact: true }).click()
    await page.waitForFunction(() => document.body.textContent.includes('Muted'), null, { timeout: 15_000 })
    await send(data.bob, quiet, { msgtype: 'm.text', body: 'a muted message' })
    await page.waitForTimeout(1500)
    assert.equal((await badge()).last, first, 'a muted room does not change the badge')
    // reading the seeded room clears its share
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await page.waitForFunction(() => window.__badge.last === 0, null, { timeout: 15_000 })
  })

  it('the browser bar takes the colour of the chosen theme', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: 'Settings' })
    await dlg.getByRole('tab', { name: 'Appearance' }).click()
    await dlg.getByRole('radio', { name: /Sand/ }).click()
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'), '#ece4d3')
    await dlg.getByRole('radio', { name: /Midnight/ }).click()
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'), '#000000')
    await dlg.getByRole('radio', { name: /System/ }).click()
    await dlg.getByRole('button', { name: 'Close' }).click()
  })

  for (const [url, check] of [
    ['/?action=new', (p) => p.getByRole('dialog', { name: 'Start something' }).waitFor({ timeout: 15_000 })],
    ['/?action=search', (p) => p.getByRole('dialog', { name: 'Search' }).waitFor({ timeout: 15_000 })],
    ['/?action=explore', (p) => p.getByRole('tab', { name: 'Explore', selected: true }).waitFor({ timeout: 15_000 })],
    ['/?view=unread', (p) => p.locator('aside header .switch').getByText('Unread').waitFor({ timeout: 15_000 })],
  ]) {
    it(`the app shortcut ${url} opens that screen and cleans the address`, async () => {
      await page.goto(server.url + url)
      await check(page)
      assert.equal(new URL(page.url()).search, '')
      await page.keyboard.press('Escape')
    })
  }

  it('an unknown shortcut does nothing', async () => {
    await page.goto(server.url + '/?action=logout&view=../../x')
    await rooms().waitFor({ timeout: 30_000 })
    assert.equal(await page.getByRole('dialog').count(), 0)
  })

  it('an installed app that is already open is told what to show', async () => {
    await page.goto(server.url)
    await rooms().waitFor({ timeout: 30_000 })
    await page.evaluate(() => window.__launch({ targetURL: location.origin + '/?action=new' }))
    await page.getByRole('dialog', { name: 'Start something' }).waitFor({ timeout: 10_000 })
  })
})
