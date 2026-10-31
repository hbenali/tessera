import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

describe('moderation, room settings and the room list preview', () => {
  let server, browser, data, page
  const enc = encodeURIComponent
  const state = (type) => api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(data.room)}/state/${type}`)
  const details = () => page.getByRole('complementary', { name: 'Room details' })
  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, data.alice)
    await rooms().getByRole('button', { name: /e2e room/ }).first().click()
    await rooms().getByRole('button', { name: /e2e room/ }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Room details' }).click()
    await details().waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('previews the last message with its sender, in a room', async () => {
    const line = await rooms().getByRole('button', { name: /e2e room/ }).first().locator('.preview').innerText()
    assert.match(line, /^You: thanks /)
  })

  it('changes who can join and who can read the history', async () => {
    await details().getByLabel('Who can join').selectOption('public')
    await page.waitForFunction(async ({ url, room, token }) => {
      const r = await fetch(`${url}/_matrix/client/v3/rooms/${encodeURIComponent(room)}/state/m.room.join_rules`, { headers: { Authorization: `Bearer ${token}` } })
      return (await r.json()).join_rule === 'public'
    }, { url: 'http://localhost:8008', room: data.room, token: data.alice.token }, { timeout: 15_000 })
    await details().getByLabel('Who can read the history').selectOption('joined')
    await page.waitForFunction(() => document.querySelector('aside[aria-label="Room details"] select[disabled]') === null)
    for (let i = 0; i < 30 && (await state('m.room.history_visibility')).history_visibility !== 'joined'; i++) await new Promise((r) => setTimeout(r, 300))
    assert.equal((await state('m.room.history_visibility')).history_visibility, 'joined')
  })

  it('promotes a member to moderator and back', async () => {
    await details().getByRole('button', { name: /bob_/ }).click()
    const card = page.getByRole('dialog', { name: /Profile of/ })
    await card.getByLabel('Role').selectOption('moderator')
    for (let i = 0; i < 30 && (await state('m.room.power_levels')).users?.[data.bob.id] !== 50; i++) await new Promise((r) => setTimeout(r, 300))
    assert.equal((await state('m.room.power_levels')).users[data.bob.id], 50)
    await card.getByLabel('Role').selectOption('member')
    for (let i = 0; i < 30 && data.bob.id in ((await state('m.room.power_levels')).users ?? {}); i++) await new Promise((r) => setTimeout(r, 300))
    assert.ok(!((await state('m.room.power_levels')).users ?? {})[data.bob.id])
    await page.keyboard.press('Escape')
  })

  it('bans with a reason, lists the ban, and unbans', async () => {
    await details().getByRole('button', { name: /bob_/ }).click()
    const card = page.getByRole('dialog', { name: /Profile of/ })
    await card.getByRole('button', { name: 'Ban…' }).click()
    await card.getByLabel(/Reason/).fill('spam')
    await card.getByRole('button', { name: 'Ban from room' }).click()
    await details().getByText(/Banned \(1\)/).waitFor({ timeout: 15_000 })
    assert.equal((await state(`m.room.member/${enc(data.bob.id)}`)).membership, 'ban')
    assert.equal((await state(`m.room.member/${enc(data.bob.id)}`)).reason, 'spam')
    await details().getByRole('button', { name: 'Unban' }).click()
    await details().getByText(/Banned \(1\)/).waitFor({ state: 'detached', timeout: 15_000 })
    assert.equal((await state(`m.room.member/${enc(data.bob.id)}`)).membership, 'leave')
  })

  it('a plain member sees no moderation controls', async () => {
    const bob = await (await browser.newContext()).newPage()
    await api(data.alice.token, 'POST', `/_matrix/client/v3/rooms/${enc(data.room)}/invite`, { user_id: data.bob.id })
    await api(data.bob.token, 'POST', `/_matrix/client/v3/join/${enc(data.room)}`, {})
    await signIn(bob, server.url, data.bob)
    await bob.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /e2e room/ }).first().click({ button: 'right' })
    await bob.getByRole('menuitem', { name: 'Room details' }).click()
    const d = bob.getByRole('complementary', { name: 'Room details' })
    await d.getByRole('button', { name: /alice_/ }).click()
    const card = bob.getByRole('dialog', { name: /Profile of/ })
    await card.getByLabel('Role').waitFor()
    assert.equal(await card.getByRole('button', { name: 'Ban…' }).count(), 0)
    assert.equal(await card.getByRole('button', { name: 'Remove…' }).count(), 0)
    assert.equal(await card.getByLabel('Role').isDisabled(), true)
    assert.equal(await d.getByLabel('Who can join').isDisabled(), true)
  })
})
