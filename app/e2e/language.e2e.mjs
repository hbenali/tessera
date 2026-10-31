import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, signIn } from './lib.mjs'

describe('language', () => {
  let server, browser, data, page
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })).newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('starts in the browser language (English here) and switches to French, remembered after a reload', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: 'Settings' })
    await dlg.getByRole('tab', { name: 'Appearance' }).click()
    await dlg.getByRole('combobox', { name: 'Language' }).selectOption('fr')
    await dlg.getByRole('tab', { name: 'Apparence' }).waitFor()
    await dlg.getByRole('button', { name: 'Close' }).click()
    await page.locator('aside header .switch').getByText('Toutes les conversations').waitFor()
    await page.reload()
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor({ timeout: 30_000 })
    await page.locator('aside header .switch').getByText('Toutes les conversations').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr')
    // a string without a translation stays in English
    await page.locator('aside header .switch').click()
    await page.getByRole('option', { name: /Non lus/ }).waitFor()
    await page.keyboard.press('Escape')
  })

  it('shows the sign-in page in the browser language', async () => {
    const fr = await (await browser.newContext({ locale: 'fr-FR' })).newPage()
    await fr.goto(server.url)
    await fr.getByRole('heading', { name: 'Se connecter' }).waitFor()
    await fr.getByRole('button', { name: 'Continuer' }).waitFor()
  })
})
