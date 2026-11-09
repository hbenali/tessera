import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('session name', () => {
  let server, browser, data
  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('names a password sign-in after the app, browser and system, so it is recognisable in any client', async () => {
    const page = await (await browser.newContext()).newPage()
    await signIn(page, server.url, data.alice)
    const { devices } = await api(data.alice.token, 'GET', '/_matrix/client/v3/devices')
    const names = devices.map((d) => d.display_name).filter(Boolean)
    assert.ok(names.some((n) => /^Tessera \((installed app, )?Chrome on (Linux|Windows|macOS)\)$/.test(n)), `device names: ${JSON.stringify(names)}`)
  })
})
