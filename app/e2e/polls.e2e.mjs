import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('polls and location', () => {
  let server, browser, data, page, bobPage
  const enc = encodeURIComponent
  const room = () => page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /e2e room/ }).first()
  const events = (type) => api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(data.room)}/messages?dir=b&limit=60`).then((r) => r.chunk.filter((e) => e.type === type))

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['geolocation'], geolocation: { latitude: 48.85837, longitude: 2.294481, accuracy: 35 } })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
    await room().click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    bobPage = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(bobPage, server.url, data.bob)
    await bobPage.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /e2e room/ }).first().click()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('creates a poll that another person can vote in, and the author can end', async () => {
    await page.getByRole('button', { name: 'Attach or share' }).click()
    await page.getByRole('menuitem', { name: 'Poll' }).click()
    const dlg = page.getByRole('dialog', { name: 'Create a poll' })
    await dlg.getByLabel('Question').fill('Pizza or sushi?')
    await dlg.getByLabel('Answer 1').fill('Pizza')
    await dlg.getByLabel('Answer 2').fill('Sushi')
    await dlg.getByRole('button', { name: 'Create poll' }).click()
    const poll = (p) => p.getByRole('group', { name: 'Poll: Pizza or sushi?' })
    await poll(page).waitFor({ timeout: 15_000 })
    await poll(bobPage).waitFor({ timeout: 15_000 })
    await poll(bobPage).getByRole('button', { name: /Sushi/ }).click()
    await poll(page).getByText('1 vote').waitFor({ timeout: 15_000 })
    assert.equal((await events('m.poll.response')).length, 1)
    await poll(page).getByRole('button', { name: /Pizza/ }).click()
    await poll(page).getByText('2 votes').waitFor({ timeout: 15_000 })
    assert.equal(await poll(bobPage).getByRole('button', { name: 'End poll' }).count(), 0, 'only the author can end it')
    await poll(page).getByRole('button', { name: 'End poll' }).click()
    await poll(bobPage).getByText('Final results').waitFor({ timeout: 15_000 })
    assert.equal(await poll(bobPage).getByRole('button', { name: /Pizza/ }).isDisabled(), true)
    assert.equal((await events('m.poll.end')).length, 1)
  })

  it('shares my location as a standard message with a map link', async () => {
    await page.getByRole('button', { name: 'Attach or share' }).click()
    await page.getByRole('menuitem', { name: 'My location' }).click()
    const dlg = page.getByRole('dialog', { name: 'Share your location' })
    await dlg.getByText('48.85837, 2.29448').waitFor({ timeout: 15_000 })
    await dlg.getByRole('button', { name: 'Send my location' }).click()
    const link = bobPage.getByRole('link', { name: /Location 48\.85837/ })
    await link.waitFor({ timeout: 15_000 })
    assert.equal(await link.getAttribute('href'), 'https://www.openstreetmap.org/?mlat=48.85837&mlon=2.294481#map=16/48.85837/2.294481')
    const [e] = await events('m.room.message').then((l) => l.filter((x) => x.content.msgtype === 'm.location'))
    assert.match(e.content.geo_uri, /^geo:48\.858370,2\.294481;u=35$/)
  })
})
