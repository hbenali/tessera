import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('forward, view source, report and remove', () => {
  let server, browser, data, page, other
  const enc = encodeURIComponent
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const msg = (text) => page.locator('article').filter({ hasText: text }).last()
  async function more(text, item) {
    await msg(text).scrollIntoViewIfNeeded()
    await msg(text).hover()
    await msg(text).getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: item }).click()
  }

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    other = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'forward target', preset: 'private_chat' })).room_id
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await msg('first message from bob').waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('forwards a message to another room', async () => {
    await more('hello bob', 'Forward')
    const dlg = page.getByRole('dialog', { name: 'Forward message' })
    await dlg.getByLabel('Find a room').fill('forward')
    await dlg.getByRole('button', { name: 'Send' }).click()
    await dlg.getByText('Forwarded to forward target').waitFor()
    const ev = await api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(other)}/messages?dir=b&limit=5`)
    assert.ok(ev.chunk.some((e) => e.type === 'm.room.message' && e.content.body === 'hello bob' && !e.content['m.relates_to']))
    await page.keyboard.press('Escape')
  })

  it('shows the source of a message', async () => {
    await more('hello bob', 'View source')
    const pre = page.getByLabel('Event JSON')
    const text = await pre.innerText()
    assert.match(text, /"type": "m.room.message"/)
    assert.match(text, /"body": "hello bob"/)
    await page.keyboard.press('Escape')
  })

  it("reports someone else's message, and offers no report on my own", async () => {
    await more('can you look?', 'Report')
    const dlg = page.getByRole('dialog', { name: 'Report message' })
    const send = dlg.getByRole('button', { name: 'Send report' })
    assert.equal(await send.isDisabled(), true)
    await dlg.getByLabel('What is wrong with it?').fill('test report')
    await send.click()
    await dlg.getByText('Reported', { exact: true }).waitFor({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await msg('hello bob').hover()
    await msg('hello bob').getByRole('button', { name: 'More actions' }).click()
    assert.equal(await page.getByRole('menuitem', { name: 'Report' }).count(), 0)
    await page.keyboard.press('Escape')
  })

  it("an admin removes someone else's message with a reason", async () => {
    await more('can you look?', 'Remove for everyone')
    const dlg = page.getByRole('dialog', { name: 'Remove message' })
    await dlg.getByLabel(/Reason/).fill('off topic')
    await dlg.getByRole('button', { name: 'Remove', exact: true }).click()
    // the message leaves the timeline, and its dialog goes with it
    await dlg.waitFor({ state: 'detached', timeout: 15_000 })
    await page.locator('article').filter({ hasText: 'can you look?' }).waitFor({ state: 'detached' })
    const ev = await api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(data.room)}/messages?dir=b&limit=100`)
    assert.ok(ev.chunk.some((e) => e.type === 'm.room.redaction'))
  })
})
