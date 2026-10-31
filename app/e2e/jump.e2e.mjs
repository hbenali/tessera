import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, send, signIn } from './lib.mjs'

describe('jump to a date or the first unread message', () => {
  let server, browser, data, page
  const visible = (text) => page.evaluate((t) => {
    const a = [...document.querySelectorAll('.scroll article')].find((x) => x.textContent.includes(t))
    const box = document.querySelector('.scroll')?.getBoundingClientRect()
    const r = a?.getBoundingClientRect()
    return !!(a && box && r.bottom > box.top && r.top < box.bottom)
  }, text)

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /e2e room/ }).first().click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('jumps to the start of a day, paging back through history', async () => {
    assert.equal(await visible('older message 1'), false)
    await page.getByRole('button', { name: 'Jump to…' }).click()
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10))
    const local = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
    await page.getByLabel('Jump to a date').fill(local || today)
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('[role=dialog][aria-label="Jump to"]'), null, { timeout: 20_000 })
    await page.waitForFunction(() => { const a = [...document.querySelectorAll('.scroll article')].find((x) => x.textContent.includes('older message 1')); const b = document.querySelector('.scroll').getBoundingClientRect(); const r = a?.getBoundingClientRect(); return !!(a && r.bottom > b.top && r.top < b.bottom) }, null, { timeout: 20_000 })
  })

  it('says so when there is nothing unread (the unread rule itself is unit-tested in jump.test.ts)', async () => {
    await page.getByRole('combobox', { name: 'Message' }).click()
    await send(data.alice, data.room, { msgtype: 'm.text', body: 'my own last word' })
    await page.getByText('my own last word', { exact: true }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Jump to…' }).click()
    await page.getByRole('button', { name: /First unread message/ }).click()
    await page.getByText('You have read everything here').waitFor({ timeout: 15_000 })
  })
})
