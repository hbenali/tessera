import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, signIn } from './lib.mjs'

describe('export and import of settings', () => {
  let server, browser, data, page
  const dlg = () => page.getByRole('dialog', { name: 'Settings' })
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
  const store = (k) => page.evaluate((k) => localStorage.getItem(k), k)
  const open = async () => {
    if (!(await dlg().count())) await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await dlg().getByRole('tab', { name: 'Appearance' }).click()
  }
  const exported = async () => {
    const dl = page.waitForEvent('download')
    await dlg().getByRole('button', { name: 'Export settings' }).click()
    const d = await dl
    return { name: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8') }
  }
  const importFile = async (text) => {
    const path = join(tmpdir(), `tessera-test-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(path, text)
    await dlg().getByLabel('Settings file').setInputFiles(path)
  }

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage()
    await signIn(page, server.url, data.alice)
    await open()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('exports the settings of this browser, and only those', async () => {
    await dlg().getByRole('radio', { name: 'Sand' }).click()
    await dlg().getByRole('radio', { name: 'Compact', exact: true }).click()
    await dlg().getByRole('radio', { name: 'Large text' }).click()
    const { name, text } = await exported()
    assert.match(name, /^tessera-settings-\d{4}-\d{2}-\d{2}\.json$/)
    const j = JSON.parse(text)
    assert.equal(j.format, 'tessera-settings')
    assert.equal(j.version, 1)
    assert.match(j.app, /^Tessera \d+\.\d+\.\d+/)
    assert.deepEqual([j.settings.theme, j.settings.density, j.settings.textSize], ['sand', 'compact', 'large'])
    assert.ok(j.settings.list && typeof j.settings.list.width === 'number')
    // No session, account, token or room data in it.
    for (const bad of [data.alice.token, data.alice.id, 'accessToken', 'access_token', 'tessera.session', data.room]) assert.ok(!text.includes(bad), `the file contains ${bad}`)
    await dlg().getByRole('status').waitFor()
    globalThis.saved = text
  })

  it('imports it again after the settings were changed: shows what changes, then applies', async () => {
    await dlg().getByRole('radio', { name: /Light$/ }).click()
    await dlg().getByRole('radio', { name: 'Comfortable' }).click()
    await dlg().getByRole('radio', { name: 'Normal text' }).click()
    assert.equal(await theme(), 'light')
    await importFile(globalThis.saved)
    const preview = dlg().getByRole('group', { name: 'Settings in this file' })
    await preview.waitFor()
    assert.match(await preview.innerText(), /Theme\s*sand/)
    assert.equal(await theme(), 'light', 'nothing changes before Apply')
    await preview.getByRole('button', { name: 'Apply' }).click()
    assert.equal(await theme(), 'sand')
    assert.equal(await dlg().getByRole('radio', { name: 'Compact', exact: true }).getAttribute('aria-checked'), 'true')
    assert.equal(await dlg().getByRole('radio', { name: 'Large text' }).getAttribute('aria-checked'), 'true')
    assert.equal(await store('tessera.theme'), 'sand', 'and it is remembered')
    await preview.waitFor({ state: 'detached' })
  })

  it('can be cancelled without changing anything', async () => {
    await dlg().getByRole('radio', { name: 'Ocean' }).click()
    await importFile(globalThis.saved)
    await dlg().getByRole('group', { name: 'Settings in this file' }).getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await theme(), 'ocean')
  })

  it('never lets a file change who you are signed in as, and names what it left out', async () => {
    const session = await store('tessera.session')
    const accounts = await store('tessera.accounts')
    assert.ok(session)
    const evil = JSON.stringify({
      format: 'tessera-settings', version: 1,
      settings: { theme: 'forest', 'tessera.session': JSON.stringify({ baseUrl: 'https://evil.example', accessToken: 'x', userId: '@a:evil.example', deviceId: 'D' }), 'tessera.accounts': '[]', language: 'klingon', __proto__: { x: 1 } },
    })
    await importFile(evil)
    const preview = dlg().getByRole('group', { name: 'Settings in this file' })
    await preview.waitFor()
    const text = await preview.innerText()
    assert.match(text, /Theme\s*forest/)
    assert.match(text, /tessera\.session/, 'it says what was left out')
    assert.doesNotMatch(text, /evil\.example/, 'and does not echo the values')
    await preview.getByRole('button', { name: 'Apply' }).click()
    assert.equal(await theme(), 'forest')
    assert.equal(await store('tessera.session'), session, 'the session is untouched')
    assert.equal(await store('tessera.accounts'), accounts, 'the accounts are untouched')
    assert.notEqual(await store('tessera.lang'), 'klingon')
  })

  it('refuses a file that is not a settings file', async () => {
    for (const text of ['not json at all', JSON.stringify({ hello: 'world' }), JSON.stringify({ format: 'tessera-settings', version: 1, settings: { theme: 'neon' } })]) {
      await importFile(text)
      await dlg().getByRole('alert').waitFor()
      assert.equal(await dlg().getByRole('group', { name: 'Settings in this file' }).count(), 0)
      assert.equal(await theme(), 'forest', 'nothing was applied')
    }
  })

  it('carries the room list display and the language, and follows into the sound section', async () => {
    const full = JSON.stringify({ format: 'tessera-settings', version: 1, settings: { language: 'fr', list: { width: 400, rows: 'compact', rail: false, sections: true }, sound: false, soundStyle: 'pop', listHidden: false } })
    await importFile(full)
    await dlg().getByRole('group', { name: 'Settings in this file' }).getByRole('button').first().click()
    assert.equal(JSON.parse(await store('tessera.list')).width, 400)
    assert.equal(JSON.parse(await store('tessera.list')).sections, true)
    assert.equal(await store('tessera.lang'), 'fr')
    assert.equal(await store('tessera.sound'), '0')
    assert.equal(await store('tessera.soundStyle'), 'pop')
  })
})
