import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const THEMES = ['dark', 'light', 'sand', 'forest', 'ocean', 'midnight', 'contrast']

describe('room menu', () => {
  let server, browser, data, ctx, page, dm
  const enc = encodeURIComponent
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const row = (re) => rooms().getByRole('button', { name: re }).first()
  const menu = () => page.getByRole('menu')

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    dm = (await api(data.bob.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'bob direct', invite: [data.alice.id], preset: 'private_chat' })).room_id
    await api(data.alice.token, 'POST', `/_matrix/client/v3/join/${enc(dm)}`, {})
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.url })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('opens on right-click with the room actions', async () => {
    await row(/e2e room/).click({ button: 'right' })
    await menu().waitFor()
    assert.equal(await menu().getAttribute('aria-label'), 'Options for e2e room')
    for (const n of ['Mute', 'Mentions only', 'Add to favourites', 'Copy link', 'Room details', 'Leave room'])
      await menu().getByRole('menuitem', { name: n }).waitFor()
    await page.keyboard.press('Escape')
    await menu().waitFor({ state: 'detached' })
  })

  it('mutes and unmutes from the menu', async () => {
    await row(/e2e room/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Mute', exact: true }).click()
    await row(/e2e room/).getByText('Muted', { exact: true }).waitFor({ timeout: 15_000 })
    await row(/e2e room/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Unmute' }).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('nav .row')].some((r) => /Muted/.test(r.textContent)), null, { timeout: 15_000 })
  })

  it('switches between mentions only and all messages', async () => {
    await row(/e2e room/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Mentions only' }).click()
    await row(/e2e room/).getByText('Mentions only').waitFor({ timeout: 15_000 })
    await row(/e2e room/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Notify for all messages' }).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('nav .row')].some((r) => /Mentions only/.test(r.textContent)), null, { timeout: 15_000 })
  })

  it('stars and unstars a room', async () => {
    await row(/e2e room/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Add to favourites' }).click()
    await row(/e2e room/).getByText('Favourite', { exact: true }).waitFor({ timeout: 15_000 })
    await row(/e2e room/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Remove from favourites' }).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('nav .row')].some((r) => /Favourite/.test(r.textContent)), null, { timeout: 15_000 })
  })

  it('works from the keyboard and returns focus to the row', async () => {
    await row(/e2e room/).focus()
    await page.keyboard.press('Shift+F10')
    await menu().waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem')
    const first = await page.evaluate(() => document.activeElement.textContent.trim())
    await page.keyboard.press('ArrowDown')
    const second = await page.evaluate(() => document.activeElement.textContent.trim())
    assert.notEqual(first, second)
    await page.keyboard.press('Escape')
    await menu().waitFor({ state: 'detached' })
    assert.match(await page.evaluate(() => document.activeElement.textContent), /e2e room/)
  })

  it('opens from the more button and from the room header', async () => {
    await row(/e2e room/).hover()
    await rooms().getByRole('button', { name: 'Options for e2e room' }).click()
    await menu().waitFor()
    await page.keyboard.press('Escape')
    await row(/e2e room/).click()
    await page.getByRole('button', { name: 'Room menu' }).click()
    assert.equal(await menu().getAttribute('aria-label'), 'Options for e2e room')
    await page.keyboard.press('Escape')
  })

  it('copies a link to the room', async () => {
    await row(/e2e room/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Copy link' }).click()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${server.url}/#/room/${enc(data.room)}`)
  })

  it('marks a room with unread messages as read', async () => {
    await row(/e2e room/).click() // leave bob direct unfocused
    await send(data.bob, dm, { msgtype: 'm.text', body: 'are you there?' })
    const badge = row(/bob direct/).locator('.badge')
    await badge.waitFor({ timeout: 20_000 })
    await row(/bob direct/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Mark as read' }).click()
    await badge.waitFor({ state: 'detached', timeout: 15_000 })
  })

  it('asks before leaving, and leaves', async () => {
    await row(/bob direct/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Leave room' }).click()
    await menu().getByText('Leave bob direct?').waitFor()
    await menu().getByRole('menuitem', { name: 'Cancel' }).click()
    await row(/bob direct/).waitFor()
    await row(/bob direct/).click({ button: 'right' })
    await menu().getByRole('menuitem', { name: 'Leave room' }).click()
    await menu().getByRole('menuitem', { name: 'Leave room' }).click()
    await row(/bob direct/).waitFor({ state: 'detached', timeout: 15_000 })
  })

  it('passes axe in every theme with the menu open', async () => {
    await page.evaluate(axeSource)
    await row(/e2e room/).click({ button: 'right' })
    await menu().waitFor()
    for (const theme of THEMES) {
      const bad = await page.evaluate(async (t) => {
        document.documentElement.dataset.theme = t
        const res = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })
        return res.violations.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`)
      }, theme)
      assert.deepEqual(bad, [], `${theme}: ${bad.join('; ')}`)
    }
  })
})
