import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

// Regression: hidden labels ("Muted", "Favourite", "Sent") are absolutely positioned. Inside a scrolling list
// that is not itself positioned they escape its clip, sit far below the screen, and make the whole page
// scrollable, so scrolling down moved the entire app up and left a blank screen.
describe('the page itself never scrolls', () => {
  let server, browser, data, page
  const enc = encodeURIComponent

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    for (let i = 0; i < 30; i++) {
      const { room_id } = await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: `crowd ${String(i).padStart(2, '0')}`, preset: 'private_chat' })
      await send(data.alice, room_id, { msgtype: 'm.text', body: `hello crowd ${i}` })
      // Muted (override rule with no actions) and starred rooms add hidden labels to the list.
      if (i % 2) await api(data.alice.token, 'PUT', `/_matrix/client/v3/pushrules/global/override/${enc(room_id)}`, { actions: [], conditions: [{ kind: 'event_match', key: 'room_id', pattern: room_id }] })
      if (i % 3 === 0) await api(data.alice.token, 'PUT', `/_matrix/client/v3/user/${enc(data.alice.id)}/rooms/${enc(room_id)}/tags/m.favourite`, { order: 0.5 })
    }
    const { room_id: long } = await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'long mine', preset: 'private_chat' })
    for (let i = 1; i <= 60; i++) await send(data.alice, long, { msgtype: 'm.text', body: `my message ${i}` })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  const metrics = () => page.evaluate(() => ({ doc: document.documentElement.scrollHeight, view: innerHeight, top: document.scrollingElement.scrollTop }))

  it('fits the window with a long room list full of muted and starred rooms', async () => {
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /crowd 29/ }).first().waitFor()
    const m = await metrics()
    assert.equal(m.doc, m.view, `document is ${m.doc}px tall in a ${m.view}px window`)
  })

  it('does not scroll the page when you scroll the list or a long room to the bottom', async () => {
    await page.mouse.move(150, 300)
    await page.mouse.wheel(0, 5000)
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /long mine/ }).first().click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    await page.waitForTimeout(800)
    await page.mouse.move(700, 300)
    await page.mouse.wheel(0, 8000)
    await page.mouse.wheel(0, 8000)
    await page.waitForTimeout(300)
    const m = await metrics()
    assert.equal(m.top, 0)
    assert.equal(m.doc, m.view)
    assert.ok(await page.getByRole('combobox', { name: 'Message' }).isVisible())
  })
})
