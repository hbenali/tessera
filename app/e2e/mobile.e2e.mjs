import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('phone layout of the newer controls', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const inside = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: innerWidth } }, sel)
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    const dm = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { is_direct: true, invite: [data.bob.id], preset: 'trusted_private_chat' })).room_id
    await api(data.bob.token, 'POST', `/_matrix/client/v3/join/${enc(dm)}`, {})
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/user/${enc(data.alice.id)}/account_data/m.direct`, { [data.bob.id]: [dm] })
    page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })).newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('a direct chat keeps room for its name; calls are in the room menu, not the header', async () => {
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button').filter({ hasText: /bob_/ }).first().tap()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Voice call' }).isVisible(), false)
    const w = await page.evaluate(() => document.querySelector('.title h1').getBoundingClientRect().width)
    assert.ok(w > 90, `the title is ${Math.round(w)}px wide`)
    await page.getByRole('button', { name: 'Room menu' }).tap()
    await page.getByRole('menuitem', { name: 'Voice call' }).waitFor()
    await page.getByRole('menuitem', { name: 'Video call' }).waitFor()
    await page.keyboard.press('Escape')
  })

  it('the jump popover stays on screen', async () => {
    await page.getByRole('button', { name: 'Jump to…' }).tap()
    const b = await inside('[role=dialog][aria-label="Jump to"]')
    assert.ok(b.l >= 0 && b.r <= b.w, `popover spans ${b.l}..${b.r} of ${b.w}`)
    await page.keyboard.press('Escape')
  })

  it('details space their controls, and nothing makes the page scroll sideways', async () => {
    await page.getByRole('button', { name: 'Room details' }).tap()
    const gap = await page.evaluate(() => { const a = [...document.querySelectorAll('aside[aria-label="Room details"] > .enc, aside[aria-label="Room details"] > .btn')]; const r = a.map((e) => e.getBoundingClientRect()); let min = 99; for (let i = 1; i < r.length; i++) min = Math.min(min, r[i].top - r[i - 1].bottom); return min })
    assert.ok(gap >= 6, `controls are ${gap}px apart`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  })

  it('the key hint is not shown on a touch screen', async () => {
    await page.getByRole('button', { name: 'Close details' }).tap()
    await page.getByRole('button', { name: 'Back to rooms' }).tap()
    assert.equal(await page.locator('.search kbd').isVisible(), false)
  })
})
