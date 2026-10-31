import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { PASSWORD, SYNAPSE, api, app, launch, register, signIn } from './lib.mjs'

const login = (name, password = PASSWORD, device = 'other phone') =>
  api(null, 'POST', '/_matrix/client/v3/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: name }, password, initial_device_display_name: device })

describe('sessions, room keys and the account', () => {
  let server, browser, user, page, second
  const dialog = () => page.getByRole('dialog', { name: 'Settings' })
  const tab = (n) => dialog().getByRole('tab', { name: n }).click()

  before(async () => {
    server = await app()
    browser = await launch()
    user = await register(`sess_${Math.random().toString(36).slice(2, 8)}`)
    second = await login(user.name)
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage()
    await signIn(page, server.url, user)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await dialog().waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('lists sessions, this one first, and renames another', async () => {
    await tab('Sessions')
    const items = dialog().locator('.devs li')
    await items.nth(1).waitFor()
    assert.match(await items.first().innerText(), /This session/)
    await dialog().getByRole('button', { name: 'Rename other phone' }).click()
    await dialog().getByLabel('Session name').fill('Work laptop')
    await dialog().getByRole('button', { name: 'Save' }).click()
    await dialog().getByText('Work laptop').waitFor()
    const { devices } = await api(user.token, 'GET', '/_matrix/client/v3/devices')
    assert.ok(devices.some((d) => d.display_name === 'Work laptop'))
  })

  it('signs another session out, asking for the password', async () => {
    await dialog().locator('.devs li').filter({ hasText: 'Work laptop' }).getByRole('button', { name: 'Sign out', exact: true }).click()
    await dialog().getByText(/asks for your password/).waitFor()
    await dialog().getByLabel(/asks for your password/).fill('wrong password')
    await dialog().locator('.devs li').filter({ hasText: 'Work laptop' }).getByRole('button', { name: 'Sign out', exact: true }).click()
    await dialog().getByText('That password is not right').waitFor()
    await dialog().getByLabel(/asks for your password/).fill(PASSWORD)
    await dialog().locator('.devs li').filter({ hasText: 'Work laptop' }).getByRole('button', { name: 'Sign out', exact: true }).click()
    await dialog().getByText('Signed out', { exact: true }).waitFor({ timeout: 15_000 })
    let status = 200
    for (let i = 0; i < 20 && status !== 401; i++) {
      status = (await fetch(`${SYNAPSE}/_matrix/client/v3/account/whoami`, { headers: { Authorization: `Bearer ${second.access_token}` } })).status
      if (status !== 401) await new Promise((r) => setTimeout(r, 250))
    }
    assert.equal(status, 401)
  })

  it('exports room keys to an encrypted file and imports it back', async () => {
    await dialog().getByLabel('Passphrase', { exact: true }).fill('long passphrase')
    await dialog().getByLabel('Repeat the passphrase').fill('long passphrase')
    const dl = page.waitForEvent('download')
    await dialog().getByRole('button', { name: 'Export' }).click()
    const path = await (await dl).path()
    const text = readFileSync(path, 'utf8')
    assert.match(text, /^-----BEGIN MEGOLM SESSION DATA-----\n/)
    await dialog().getByLabel('Key file').setInputFiles(path)
    await dialog().getByLabel('File passphrase').fill('nope')
    await dialog().getByRole('button', { name: 'Import' }).click()
    await dialog().getByText(/Wrong passphrase/).waitFor()
    await dialog().getByLabel('File passphrase').fill('long passphrase')
    await dialog().getByRole('button', { name: 'Import' }).click()
    await dialog().getByText(/Keys imported/).waitFor({ timeout: 15_000 })
  })

  it('changes the password, and the new one signs in', async () => {
    await tab('Account')
    await dialog().getByLabel('Current password').fill(PASSWORD)
    await dialog().getByLabel('New password', { exact: true }).fill('a brand new pass 99')
    await dialog().getByLabel('Repeat the new password').fill('a brand new pass 99')
    await dialog().getByRole('button', { name: 'Change password' }).click()
    await dialog().getByText('Password changed').waitFor({ timeout: 15_000 })
    const r = await login(user.name, 'a brand new pass 99', 'check')
    assert.ok(r.access_token)
  })
})
