import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('a reload shows the room list before the app has loaded', () => {
  let server, browser, data, page, release
  const enc = encodeURIComponent
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    // an encrypted room with a recognisable last message
    const room = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'vault', preset: 'private_chat', initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] })).room_id
    assert.ok(room)
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })).newPage() // a service worker would answer from its cache and skip the held route
    await signIn(page, server.url, data.alice)
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /vault/ }).first().waitFor({ timeout: 15_000 })
  })
  after(async () => {
    release?.()
    await browser?.close()
    server?.stop()
  })

  it('keeps a picture of the list, without the text of encrypted rooms', async () => {
    await page.waitForFunction((id) => { try { return JSON.parse(localStorage.getItem(`tessera.snapshot.${id}`) ?? '[]').length >= 2 } catch { return false } }, data.alice.id, { timeout: 15_000 })
    const raw = await page.evaluate((id) => localStorage.getItem(`tessera.snapshot.${id}`), data.alice.id)
    const rooms = JSON.parse(raw)
    assert.ok(rooms.some((r) => r.name === 'e2e room' && r.preview.length > 0), 'a plain room keeps its preview')
    assert.ok(rooms.find((r) => r.name === 'vault').encrypted)
    assert.equal(rooms.find((r) => r.name === 'vault').preview, '')
  })

  it('paints real room names while the Matrix SDK is still downloading', async () => {
    let gate
    const held = new Promise((r) => (gate = r))
    release = gate
    await page.route('**/assets/matrix.svelte-*.js', async (route) => { await held; await route.continue().catch(() => {}) })
    await page.reload({ waitUntil: 'commit' })
    await page.locator('.app .real .n').first().waitFor({ timeout: 10_000 })
    const shown = await page.locator('.app .real .n').allInnerTexts()
    assert.ok(shown.includes('e2e room'), `the skeleton lists ${JSON.stringify(shown)}`)
    assert.equal(await page.getByRole('navigation', { name: 'Rooms' }).count(), 0, 'the real app is not there yet')
    gate()
    await page.waitForTimeout(300)
    await page.unroute('**/assets/matrix.svelte-*.js', undefined).catch(() => {})
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor({ timeout: 30_000 })
  })

  it('signing out forgets the picture', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: 'Settings' })
    await dlg.getByRole('tab', { name: 'Account' }).click()
    await dlg.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 30_000 })
    assert.equal(await page.evaluate((id) => localStorage.getItem(`tessera.snapshot.${id}`), data.alice.id), null)
  })
})
