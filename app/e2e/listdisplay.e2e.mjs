import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

describe('room list display', () => {
  let server, browser, data, page
  const side = () => page.locator('aside.sidebar')
  const width = async () => Math.round((await side().boundingBox()).width)
  const row = (re) => page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: re }).first()
  const dialog = () => page.getByRole('dialog', { name: 'List display' })
  const openDialog = async () => { if (!(await dialog().count())) await page.getByRole('button', { name: 'List display' }).click(); await dialog().waitFor() }
  const closeDialog = async () => { await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'detached' }) }
  const rowHeight = async () => Math.round((await page.locator('.list .row').first().boundingBox()).height)

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'other room', preset: 'private_chat' })
    // A room with two plain unread messages: no mention, so the dot style applies to it.
    const plain = (await api(data.bob.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'plain room', invite: [data.alice.id], preset: 'private_chat' })).room_id
    await api(data.alice.token, 'POST', `/_matrix/client/v3/join/${encodeURIComponent(plain)}`, {})
    const mention = (await api(data.bob.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'mention room', invite: [data.alice.id], preset: 'private_chat' })).room_id
    await api(data.alice.token, 'POST', `/_matrix/client/v3/join/${encodeURIComponent(mention)}`, {})
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    // Be in the other room, so that the e2e room collects unread messages.
    await row(/other room/).click()
    await page.getByRole('heading', { name: 'other room' }).waitFor()
    await send(data.bob, plain, { msgtype: 'm.text', body: 'plain one' })
    await send(data.bob, plain, { msgtype: 'm.text', body: 'plain two' })
    await send(data.bob, mention, { msgtype: 'm.text', body: `hey ${data.alice.id}`, 'm.mentions': { user_ids: [data.alice.id] } })
    await row(/plain room/).getByText('plain two').waitFor()
    await row(/mention room/).getByText(/hey/).waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('resizes with the keyboard, with a drag and with a double click, and remembers the width', async () => {
    assert.equal(await width(), 320)
    const grip = page.getByRole('separator', { name: 'Resize the room list' })
    await grip.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await grip.getAttribute('aria-valuenow'), '336')
    assert.equal(await width(), 336)
    await page.keyboard.press('Home')
    assert.equal(await width(), 240)
    await page.keyboard.press('End')
    assert.equal(await width(), 480)
    const b = await grip.boundingBox()
    await page.mouse.move(b.x + 3, b.y + 200)
    await page.mouse.down()
    await page.mouse.move(400, b.y + 200, { steps: 6 })
    await page.mouse.up()
    assert.ok(Math.abs((await width()) - 400) <= 8, `dragged to ${await width()}`)
    await page.reload()
    await side().waitFor()
    assert.ok(Math.abs((await width()) - 400) <= 8, 'the width came back after a reload')
    await page.getByRole('separator', { name: 'Resize the room list' }).dblclick()
    assert.equal(await width(), 320)
  })

  it('changes the row density and the avatar size', async () => {
    await openDialog()
    const comfortable = await rowHeight()
    await dialog().getByRole('radiogroup', { name: 'Rows' }).getByRole('radio', { name: 'Compact' }).click()
    const compact = await rowHeight()
    await dialog().getByRole('radiogroup', { name: 'Rows' }).getByRole('radio', { name: 'Large' }).click()
    const large = await rowHeight()
    assert.ok(compact < comfortable && comfortable < large, `${compact} < ${comfortable} < ${large}`)
    await dialog().getByRole('radiogroup', { name: 'Rows' }).getByRole('radio', { name: 'Comfortable' }).click()
    const normal = await page.locator('.list .row').first().locator('.wrap').boundingBox()
    await dialog().getByRole('radiogroup', { name: 'Avatars' }).getByRole('radio', { name: 'Large' }).click()
    const big = await page.locator('.list .row').first().locator('.wrap').boundingBox()
    assert.ok(big.width > normal.width, `avatar ${normal.width} -> ${big.width}`)
    await dialog().getByRole('radiogroup', { name: 'Avatars' }).getByRole('radio', { name: 'Normal' }).click()
  })

  it('hides the message previews and keeps the unread count on the name line', async () => {
    assert.ok(await page.locator('.list .preview').count() > 0)
    await dialog().getByRole('switch', { name: /message previews/ }).uncheck()
    assert.equal(await page.locator('.list .preview').count(), 0)
    assert.match(await row(/plain room/).locator('.top .badge').innerText(), /^2$/)
    await dialog().getByRole('switch', { name: /message previews/ }).check()
  })

  it('shows unread as a dot instead of a number', async () => {
    await dialog().getByRole('radiogroup', { name: 'Unread badges' }).getByRole('radio', { name: 'Dot' }).click()
    const badge = row(/plain room/).locator('.badge.dot')
    await badge.waitFor()
    assert.equal((await badge.boundingBox()).width, 9)
    assert.match(await badge.locator('.sr').innerText(), /2 unread/, 'still readable by a screen reader')
    // A mention keeps its number, even in dot mode.
    assert.match(await row(/mention room/).locator('.badge').innerText(), /^1$/)
    await dialog().getByRole('radiogroup', { name: 'Unread badges' }).getByRole('radio', { name: 'Count' }).click()
  })

  it('hides the status icons', async () => {
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/user/${encodeURIComponent(data.alice.id)}/rooms/${encodeURIComponent(data.room)}/tags/m.favourite`, { order: 0.5 })
    await row(/e2e room/).locator('.fav').waitFor()
    await dialog().getByRole('switch', { name: /status icons/ }).uncheck()
    assert.equal(await page.locator('.list .lock').count(), 0)
    await dialog().getByRole('switch', { name: /status icons/ }).check()
  })

  it('groups under headings that fold, and remembers which are folded', async () => {
    await dialog().getByRole('switch', { name: /Group under headings/ }).check()
    await closeDialog()
    await page.getByRole('button', { name: /^Favourites/ }).waitFor()
    const rooms = page.getByRole('button', { name: /^Rooms/ })
    await rooms.waitFor()
    assert.equal(await rooms.getAttribute('aria-expanded'), 'true')
    await rooms.click()
    assert.equal(await rooms.getAttribute('aria-expanded'), 'false')
    assert.equal(await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /plain room/ }).count(), 0, 'the folded rooms are hidden')
    assert.match(await rooms.locator('.sn').innerText(), /^3$/, 'a folded heading still shows the unread count of its rooms (2 + 1)')
    await page.reload()
    assert.equal(await page.getByRole('button', { name: /^Rooms/ }).getAttribute('aria-expanded'), 'false', 'folded after a reload')
    await page.getByRole('button', { name: /^Rooms/ }).click()
  })

  it('collapses to an icon-only strip with the unread mark, and there is an obvious way back', async () => {
    await openDialog()
    await dialog().getByRole('switch', { name: /Icons only/ }).click()
    // The panel does not stay open, squeezed into the narrow strip.
    await dialog().waitFor({ state: 'detached' })
    assert.ok((await width()) <= 72, `the strip is ${await width()}px`)
    const r = row(/^plain room$/)
    await r.waitFor()
    assert.equal(await page.locator('.list .row .body').first().isVisible(), false)
    assert.equal(await page.getByRole('button', { name: /^Favourites/ }).count(), 0, 'no headings in the strip')
    assert.match(await r.locator('.rbadge').innerText(), /2/)
    assert.equal(await page.getByRole('separator', { name: 'Resize the room list' }).count(), 0)
    // The way back is at the top of the strip, in plain view, and there is only one of it.
    const back = page.getByRole('button', { name: 'Show the full room list' })
    assert.equal(await back.count(), 1)
    const bb = await back.boundingBox()
    assert.ok(bb.y < 150 && bb.x >= 0 && bb.x + bb.width <= 72, `the button is at ${Math.round(bb.x)},${Math.round(bb.y)}`)
    // The display options are still reachable from the strip and open beside it, fully on screen.
    await page.getByRole('button', { name: 'List display' }).click()
    const box = await dialog().boundingBox()
    assert.ok(box.x >= 68 && box.width >= 280 && box.x + box.width <= 1280, `the panel is at ${Math.round(box.x)}, ${Math.round(box.width)} wide`)
    await dialog().getByRole('switch', { name: /Icons only/ }).click()
    await dialog().waitFor({ state: 'detached' })
    assert.ok((await width()) > 200, 'unchecking it brings the full list back')
    await page.getByRole('button', { name: 'List display' }).click()
    await dialog().getByRole('switch', { name: /Icons only/ }).click()
    await dialog().waitFor({ state: 'detached' })
    await back.click()
    assert.ok((await width()) > 200)
  })

  it('always shows the full list on a phone, and keeps the settings', async () => {
    await openDialog()
    await dialog().getByRole('switch', { name: /Icons only/ }).click()
    await closeDialog()
    await page.setViewportSize({ width: 390, height: 800 })
    await page.reload()
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor()
    assert.ok((await width()) > 300, 'the list is not a strip on a phone')
    assert.equal(await page.locator('aside.sidebar.rail').count(), 0)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(300)
    assert.ok((await width()) <= 72, 'the strip is back on a wide window')
    await page.getByRole('button', { name: 'Show the full room list' }).click()
  })

  it('resets everything to the defaults', async () => {
    await openDialog()
    await dialog().getByRole('radiogroup', { name: 'Rows' }).getByRole('radio', { name: 'Large' }).click()
    await dialog().getByRole('button', { name: 'Reset to defaults' }).click()
    assert.equal(await dialog().getByRole('radiogroup', { name: 'Rows' }).getByRole('radio', { name: 'Comfortable' }).getAttribute('aria-checked'), 'true')
    assert.equal(await dialog().getByRole('switch', { name: /Group under headings/ }).isChecked(), false)
    assert.equal(await width(), 320)
  })
})
