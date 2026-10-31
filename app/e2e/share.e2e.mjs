import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('share target and bridged rooms', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('opened from a share sheet, asks for a room and fills its message box', async () => {
    await page.goto(`${server.url}/?share=1&title=Cool%20page&text=Worth%20a%20look&url=${enc('https://example.org/x')}`)
    const banner = page.getByRole('status').filter({ hasText: 'Share to…' })
    await banner.waitFor({ timeout: 30_000 })
    assert.match(await banner.innerText(), /Worth a look/)
    assert.equal(new URL(page.url()).search, '', 'the share parameters leave the address')
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await banner.waitFor({ state: 'detached' })
    const box = page.getByRole('combobox', { name: 'Message' })
    await box.waitFor()
    assert.equal(await box.inputValue(), 'Cool page\nWorth a look\nhttps://example.org/x')
  })

  it('says when a room is bridged to another network', async () => {
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/rooms/${enc(data.room)}/state/m.bridge/slack`, { protocol: { id: 'slack', displayname: 'Slack' }, channel: { id: 'C1', displayname: '#general' }, bridgebot: '@bot:localhost' })
    await rooms().getByRole('button', { name: /e2e room/ }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Room details' }).click()
    await page.getByRole('complementary', { name: 'Room details' }).getByText('Bridged to Slack · #general').waitFor({ timeout: 15_000 })
  })
})
