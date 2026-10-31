import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { chromium } from 'playwright-core'
import { api, app, seed, signIn } from './lib.mjs'

describe('1:1 calls', () => {
  let server, browser, data, alice, bob, dm
  const enc = encodeURIComponent
  before(async () => {
    server = await app()
    // a fake camera and microphone, and no permission prompt
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
    data = await seed()
    dm = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { is_direct: true, invite: [data.bob.id], preset: 'trusted_private_chat' })).room_id
    await api(data.bob.token, 'POST', `/_matrix/client/v3/join/${enc(dm)}`, {})
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/user/${enc(data.alice.id)}/account_data/m.direct`, { [data.bob.id]: [dm] })
    await api(data.bob.token, 'PUT', `/_matrix/client/v3/user/${enc(data.bob.id)}/account_data/m.direct`, { [data.alice.id]: [dm] })
    const mk = async (u) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera', 'microphone'] })
      const p = await ctx.newPage()
      await signIn(p, server.url, u)
      await p.getByRole('navigation', { name: 'Rooms' }).getByRole('button').filter({ hasText: /alice_|bob_/ }).first().click()
      return p
    }
    alice = await mk(data.alice)
    bob = await mk(data.bob)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  it('rings the other person, connects with audio, and either side can hang up', async () => {
    await alice.getByRole('button', { name: 'Voice call' }).click()
    const mine = alice.getByRole('dialog', { name: /Call with/ })
    const theirs = bob.getByRole('dialog', { name: /Call with/ })
    await mine.getByText(/Calling/).waitFor({ timeout: 15_000 })
    await theirs.getByText(/is calling you/).waitFor({ timeout: 20_000 })
    assert.equal(await theirs.getByRole('button', { name: /Answer with video/ }).count(), 0, 'a voice call offers no video answer')
    await theirs.getByRole('button', { name: 'Answer', exact: true }).click()
    await mine.getByText(/On a call with/).waitFor({ timeout: 30_000 })
    await theirs.getByText(/On a call with/).waitFor({ timeout: 30_000 })
    await mine.getByRole('button', { name: 'Mute microphone' }).click()
    await mine.getByRole('button', { name: 'Unmute microphone' }).waitFor()
    await bob.getByRole('button', { name: 'Hang up' }).click()
    await alice.waitForFunction(() => !document.querySelector('[role=dialog][aria-label^="Call with"]') || /Call ended/.test(document.body.textContent), null, { timeout: 15_000 })
    const events = (await api(data.alice.token, 'GET', `/_matrix/client/v3/rooms/${enc(dm)}/messages?dir=b&limit=30`)).chunk.map((e) => e.type)
    for (const t of ['m.call.invite', 'm.call.answer', 'm.call.hangup']) assert.ok(events.includes(t), `${t} was sent`)
  })

  it('a video call can be declined', async () => {
    await alice.getByRole('button', { name: 'Video call' }).click({ timeout: 20_000 })
    const theirs = bob.getByRole('dialog', { name: /Call with/ })
    await theirs.getByRole('button', { name: /Answer with video/ }).waitFor({ timeout: 20_000 })
    await theirs.getByRole('button', { name: 'Decline' }).click()
    await alice.getByText(/declined|Call ended/).first().waitFor({ timeout: 15_000 })
  })
})
