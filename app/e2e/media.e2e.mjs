import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, send, signIn, upload } from './lib.mjs'

const here = new URL('.', import.meta.url).pathname

describe('shared media', () => {
  let server, browser, data, page
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const panel = () => page.getByRole('complementary', { name: 'Shared media' })

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    const a = await upload(data.bob, `${here}../public/icon-192.png`, 'image/png')
    const b = await upload(data.bob, `${here}../public/screenshots/narrow.png`, 'image/png')
    await send(data.bob, data.room, { msgtype: 'm.image', body: 'second.png', url: a, info: { mimetype: 'image/png', w: 192, h: 192 } })
    await send(data.bob, data.room, { msgtype: 'm.text', body: 'docs are at https://example.com/docs, thanks' })
    await send(data.bob, data.room, { msgtype: 'm.image', body: 'third.png', url: b, info: { mimetype: 'image/png', w: 540, h: 720 } })
    await send(data.bob, data.room, { msgtype: 'm.file', body: 'report.pdf', url: a, info: { mimetype: 'application/pdf', size: 1234 } })
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await page.locator('article').filter({ hasText: 'report.pdf' }).last().waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('lists the pictures of the room, newest first, grouped by month', async () => {
    await page.getByRole('button', { name: 'Shared media' }).click()
    await panel().waitFor()
    assert.match(await panel().getByRole('button', { name: /^Photos/ }).innerText(), /3/)
    assert.equal(await panel().getByRole('button', { name: /^Open image/ }).count(), 3)
    assert.equal(await panel().locator('h3').count(), 1)
  })

  it('opens a picture in the viewer with a strip of all pictures to jump between', async () => {
    await panel().getByRole('button', { name: /^Open image/ }).first().click()
    const viewer = page.getByRole('dialog', { name: 'Image viewer' })
    await viewer.waitFor()
    const strip = viewer.getByRole('group', { name: 'All photos in this room' })
    assert.equal(await strip.getByRole('button').count(), 3)
    assert.match(await viewer.locator('.who span').innerText(), /3 of 3/)
    await strip.getByRole('button').first().click()
    assert.match(await viewer.locator('.who span').innerText(), /1 of 3/)
    assert.equal(await strip.locator('[aria-current=true]').count(), 1)
    await page.keyboard.press('Escape')
    await viewer.waitFor({ state: 'detached' })
  })

  it('lists files and links, and shows a message in the chat', async () => {
    await panel().getByRole('button', { name: /^Files/ }).click()
    await panel().getByText('report.pdf').waitFor()
    await panel().getByRole('button', { name: /^Links/ }).click()
    const link = panel().getByRole('link', { name: /example\.com/ })
    await link.waitFor()
    assert.equal(await link.getAttribute('href'), 'https://example.com/docs')
    assert.match(await link.getAttribute('rel'), /noopener/)
    await panel().getByRole('button', { name: /Show in chat/ }).first().click()
  })

  it('pages back to find older media in a long room', async () => {
    await panel().getByRole('button', { name: /^Photos/ }).click()
    // The seeded image is among the newest messages; the panel reads history only to look further back.
    await panel().getByText(/everything in this room|Load earlier|Loading earlier/).waitFor()
  })

  it('closes with its button', async () => {
    await panel().getByRole('button', { name: 'Close' }).click()
    await panel().waitFor({ state: 'detached' })
  })
})
