import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('export a conversation', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  const msg = (text) => page.locator('article').filter({ hasText: text }).last()
  async function more(text, item) {
    for (let i = 0; ; i++) {
      try {
        await msg(text).scrollIntoViewIfNeeded()
        await msg(text).hover()
        await msg(text).getByRole('button', { name: 'More actions' }).click({ timeout: 5000 })
        break
      } catch (e) {
        if (i >= 4) throw e
        await page.mouse.move(5, 5)
        await page.waitForTimeout(300)
      }
    }
    await page.getByRole('menuitem', { name: item }).click()
  }
  const events = async () => (await api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(data.room)}/messages?dir=b&limit=200`)).chunk.length
  async function save(format) {
    const dlg = page.getByRole('dialog', { name: 'Export conversation' })
    await dlg.getByLabel(format).check()
    const dl = page.waitForEvent('download')
    await dlg.getByRole('button', { name: 'Download image' }).click()
    const d = await dl
    return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) }
  }
  const openDialog = async () => {
    await page.getByRole('button', { name: 'Room menu' }).click()
    await page.getByRole('menuitem', { name: 'Export as image' }).click()
  }

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage()
    await signIn(page, server.url, data.alice)
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await msg('first message from bob').waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('saves the whole room as CSV, PNG and PDF, and sends nothing', async () => {
    const before = await events()
    await openDialog()
    const csv = await save('Text (CSV)')
    assert.match(csv.name, /^e2e-room-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = csv.bytes.toString('utf8')
    assert.ok(text.startsWith('﻿Time (ISO 8601),Sender,Sender ID,Message,Reactions'))
    for (const s of ['older message 1,', 'first message from bob', 'hello bob', 'thanks']) assert.ok(text.includes(s), s)
    const png = await save('Image (PNG)')
    assert.match(png.name, /\.png$/)
    assert.equal(png.bytes.subarray(1, 4).toString(), 'PNG')
    const pdf = await save('PDF')
    assert.match(pdf.name, /\.pdf$/)
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-')
    assert.equal(await events(), before, 'exporting must not send anything to the room')
    await page.keyboard.press('Escape')
  })

  it('exports from one message to another, picking each end on the timeline', async () => {
    await more('hello bob', 'Export from here')
    const bar = page.getByRole('region', { name: 'Export conversation' })
    await bar.waitFor()
    // The timeline is still usable, so the other end can be picked.
    await more('thanks', 'Export up to here')
    assert.match(await bar.innerText(), /From .*To /s)
    await bar.getByRole('button', { name: 'Export…' }).click()
    const csv = (await save('Text (CSV)')).bytes.toString('utf8')
    assert.ok(csv.includes('hello bob') && csv.includes('thanks'))
    assert.ok(!csv.includes('first message from bob') && !csv.includes('older message 1,'))
    await page.keyboard.press('Escape')
  })

  it('keeps the chosen range when the dialog is closed, and can reset it', async () => {
    const bar = page.getByRole('region', { name: 'Export conversation' })
    await bar.waitFor()
    await bar.getByRole('button', { name: 'Cancel' }).click()
    await bar.waitFor({ state: 'detached' })
  })

  it('prints the formatted message, or the Markdown source when asked', async () => {
    await page.getByRole('combobox', { name: 'Message' }).fill('**bold** and `code`')
    await page.keyboard.press('Enter')
    await msg('bold').waitFor()
    await openDialog()
    assert.ok((await save('Text (CSV)')).bytes.toString('utf8').includes(',bold and code,'))
    await page.getByLabel('Print the Markdown source').check()
    assert.ok((await save('Text (CSV)')).bytes.toString('utf8').includes('**bold** and `code`'))
  })
})
