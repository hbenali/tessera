import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, send, signIn } from './lib.mjs'

describe('link previews', () => {
  let server, browser, data, page, asked
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    await send(data.bob, data.room, { msgtype: 'm.text', body: 'worth reading: https://example.com/article.' })
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    asked = []
    // The homeserver would fetch the page; Synapse refuses private addresses, so answer in the browser.
    await page.route('**/preview_url*', (route) => {
      asked.push(new URL(route.request().url()).searchParams.get('url'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ 'og:title': 'An article', 'og:description': 'About things', 'og:site_name': 'Example' }) })
    })
    await signIn(page, server.url, data.alice)
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /e2e room/ }).first().click()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('shows a card for the link, asking the server for the link without the final full stop', async () => {
    const card = page.locator('a.lp')
    await card.waitFor({ timeout: 15_000 })
    assert.match(await card.innerText(), /An article/)
    assert.equal(await card.getAttribute('href'), 'https://example.com/article')
    assert.match(await card.getAttribute('rel'), /noopener/)
    assert.deepEqual(asked, ['https://example.com/article'])
  })

  it('stops asking when previews are switched off', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: 'Settings' })
    await dlg.getByRole('tab', { name: 'Privacy' }).click()
    await dlg.getByRole('switch', { name: /Show link previews/ }).uncheck()
    await dlg.getByRole('button', { name: 'Close' }).click()
    await page.locator('a.lp').waitFor({ state: 'detached', timeout: 10_000 })
  })
})
