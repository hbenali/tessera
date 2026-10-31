import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('working offline', () => {
  let server, browser, data, ctx, page
  const enc = encodeURIComponent
  const box = () => page.getByRole('combobox', { name: 'Message' })
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const onServer = (text) => api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(data.room)}/messages?dir=b&limit=20`).then((r) => r.chunk.some((e) => e.content?.body === text))

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await box().waitFor()
    // the service worker takes control, installs, and is asked to keep the big files too
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 }).catch(async () => { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 }) })
    const cached = () => page.evaluate(async () => { const out = []; for (const k of await caches.keys()) out.push(...(await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)); return out })
    for (let i = 0; i < 80; i++) {
      const urls = await cached()
      if (urls.some((u) => u.startsWith('/assets/') && u.endsWith('.js')) && urls.some((u) => u.endsWith('.wasm'))) break
      await new Promise((r) => setTimeout(r, 500))
    }
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('keeps the app\'s files, not only the page, so it can start with no network', async () => {
    const urls = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) out.push(...(await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)); return out })
    assert.ok(urls.includes('/'), 'the page')
    assert.ok(urls.filter((u) => u.startsWith('/assets/') && u.endsWith('.js')).length >= 3, 'the scripts')
    assert.ok(urls.some((u) => u.startsWith('/assets/') && u.endsWith('.css')), 'the styles')
    assert.ok(urls.some((u) => u.endsWith('.wasm')), 'the encryption module')
    assert.ok(!urls.some((u) => u.endsWith('.map')), 'no source maps')
  })

  it('reloading with no network still shows your rooms and says you are offline', async () => {
    await ctx.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await rooms().getByRole('button', { name: /e2e room/ }).first().waitFor({ timeout: 30_000 })
    await page.getByText(/You are offline/).waitFor({ timeout: 20_000 })
  })

  it('a message written offline waits, and is sent by itself when the connection returns', async () => {
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await box().waitFor()
    await box().fill('written while offline')
    await box().press('Enter')
    await page.getByText('Not sent').first().waitFor({ timeout: 20_000 })
    assert.equal(await onServer('written while offline'), false, 'nothing reached the server yet')
    await ctx.setOffline(false)
    for (let i = 0; i < 60 && !(await onServer('written while offline')); i++) await new Promise((r) => setTimeout(r, 500))
    assert.equal(await onServer('written while offline'), true, 'it was sent without pressing Retry')
    await page.getByText('Not sent').waitFor({ state: 'detached', timeout: 20_000 })
    await page.getByText(/You are offline/).waitFor({ state: 'detached', timeout: 20_000 })
  })
})
