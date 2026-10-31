import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

describe('room directory, asking to join and spaces', () => {
  let server, browser, data, page, open, knock
  const enc = encodeURIComponent
  const dlg = () => page.getByRole('dialog', { name: 'Start something' })
  const tag = Math.random().toString(36).slice(2, 7)

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    const mk = async (name, join_rule) => {
      const id = (await api(data.bob.token, 'POST', '/_matrix/client/v3/createRoom', { name, preset: 'public_chat', initial_state: [{ type: 'm.room.join_rules', state_key: '', content: { join_rule } }], room_version: '10' })).room_id
      await api(data.bob.token, 'PUT', `/_matrix/client/v3/directory/list/room/${enc(id)}`, { visibility: 'public' })
      return id
    }
    open = await mk(`Open ${tag} hall`, 'public')
    knock = await mk(`Knock ${tag} hall`, 'knock')
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await page.getByRole('button', { name: 'Explore public rooms' }).click()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('finds public rooms by name and joins one', async () => {
    await dlg().getByLabel('Search public rooms').fill(`${tag} hall`)
    const row = dlg().locator('li.room').filter({ hasText: `Open ${tag} hall` })
    await row.waitFor({ timeout: 15_000 })
    await row.getByRole('button', { name: 'Join' }).click()
    await dlg().waitFor({ state: 'detached', timeout: 15_000 })
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: new RegExp(`Open ${tag} hall`) }).first().waitFor({ timeout: 15_000 })
    assert.equal((await api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(open)}/state/m.room.member/${enc(data.alice.id)}`)).membership, 'join')
  })

  it('asks to join a room that needs approval, with a reason', async () => {
    await page.getByRole('button', { name: 'Explore public rooms' }).click()
    await dlg().getByLabel('Search public rooms').fill(`Knock ${tag}`)
    const row = dlg().locator('li.room').filter({ hasText: `Knock ${tag} hall` })
    await row.waitFor({ timeout: 15_000 })
    assert.equal(await row.getByRole('button', { name: 'Join', exact: true }).count(), 0)
    await row.getByRole('button', { name: 'Ask to join' }).click()
    await dlg().getByLabel('Why do you want to join?').fill('I would like to help')
    await dlg().getByRole('button', { name: 'Send request' }).click()
    await row.getByText('Asked').waitFor({ timeout: 15_000 })
    const m = await api(data.bob.token, 'GET', `/_matrix/client/v3/rooms/${enc(knock)}/state/m.room.member/${enc(data.alice.id)}`)
    assert.equal(m.membership, 'knock')
    assert.equal(m.reason, 'I would like to help')
    await page.keyboard.press('Escape')
  })

  it('creates a space and puts a room in it', async () => {
    await page.getByRole('button', { name: 'New room or message' }).click()
    await dlg().getByRole('tab', { name: 'New space' }).click()
    await dlg().getByLabel('Space name').fill(`Team ${tag}`)
    await dlg().getByRole('button', { name: 'Create space' }).click()
    await dlg().waitFor({ state: 'detached', timeout: 15_000 })
    await page.locator('aside header .switch').click()
    await page.getByRole('option', { name: new RegExp(`Team ${tag}`) }).waitFor({ timeout: 15_000 })
    await page.getByRole('option', { name: /^All conversations/ }).click()
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /e2e room/ }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Room details' }).click()
    const d = page.getByRole('complementary', { name: 'Room details' })
    await d.getByRole('checkbox', { name: new RegExp(`Team ${tag}`) }).check()
    let child
    for (let i = 0; i < 30 && !child; i++) {
      const sp = (await api(data.alice.token, 'GET', '/_matrix/client/v3/joined_rooms')).joined_rooms
      for (const id of sp) {
        const c = await api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(id)}/state/m.space.child/${enc(data.room)}`).catch(() => null)
        if (c?.via) child = c
      }
      if (!child) await new Promise((r) => setTimeout(r, 300))
    }
    assert.ok(child?.via?.length)
  })
})
