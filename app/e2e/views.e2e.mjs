import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, signIn } from './lib.mjs'

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const THEMES = ['dark', 'light', 'sand', 'forest', 'ocean', 'midnight', 'contrast']

describe('room views, muted and favourite rooms, and who reacted', () => {
  let server, browser, data, page, dm
  const enc = encodeURIComponent

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    // A direct chat, so People and Rooms differ.
    dm = (await api(data.bob.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'bob direct', is_direct: true, invite: [data.alice.id], preset: 'trusted_private_chat' })).room_id
    await api(data.alice.token, 'POST', `/_matrix/client/v3/join/${enc(dm)}`, {})
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/user/${enc(data.alice.id)}/account_data/m.direct`, { [data.bob.id]: [dm] })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await ctx.newPage()
    await signIn(page, server.url, data.alice)
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  const rooms = () => page.getByRole('navigation', { name: 'Rooms' })
  async function view(name) {
    await page.locator('aside header .switch').click()
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
  }

  it('offers views such as People and Rooms in the workspace menu', async () => {
    await page.locator('aside header .switch').click()
    for (const n of ['All conversations', 'Unread', 'Mentions', 'Favourites', 'People', 'Rooms'])
      await page.getByRole('option', { name: new RegExp(`^${n}`) }).waitFor()
    await page.keyboard.press('Escape')
    await page.locator('aside header .switch').click().catch(() => {})
  })

  it('People shows only direct chats and Rooms only the rest', async () => {
    await view('People')
    await rooms().getByRole('button', { name: /bob direct/ }).waitFor()
    assert.equal(await rooms().getByRole('button', { name: /e2e room/ }).count(), 0)
    assert.match(await page.locator('aside header .wsname').innerText(), /People/)
    await view('Rooms')
    await rooms().getByRole('button', { name: /e2e room/ }).waitFor()
    assert.equal(await rooms().getByRole('button', { name: /bob direct/ }).count(), 0)
    await view('All conversations')
  })

  it('shows a muted room with an indicator, in the list and in the room header', async () => {
    await rooms().getByRole('button', { name: /e2e room/ }).click()
    await page.getByRole('button', { name: 'Room details' }).click()
    await page.getByRole('radio', { name: 'Mute' }).click()
    const row = rooms().getByRole('button', { name: /e2e room/ })
    await row.getByText('Muted', { exact: true }).waitFor({ timeout: 15_000 })
    await page.locator('main header h1').getByText('Muted', { exact: true }).waitFor()
    await page.getByRole('radio', { name: 'Mentions' }).click()
    await row.getByText('Mentions only').waitFor({ timeout: 15_000 })
    assert.equal(await row.getByText('Muted', { exact: true }).count(), 0)
    await page.getByRole('radio', { name: 'All', exact: true }).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('nav .row')].some((r) => /Muted|Mentions only/.test(r.textContent)))
  })

  it('stars a room and lists it under Favourites', async () => {
    await page.getByRole('button', { name: 'Add to favourites' }).click()
    await rooms().getByRole('button', { name: /e2e room/ }).getByText('Favourite', { exact: true }).waitFor({ timeout: 15_000 })
    await view('Favourites')
    await rooms().getByRole('button', { name: /e2e room/ }).waitFor()
    assert.equal(await rooms().getByRole('button', { name: /bob direct/ }).count(), 0)
    await view('All conversations')
  })

  it('shows who reacted, highlights my own reaction and takes it back on click', async () => {
    const first = (await api(data.bob.token, 'GET', `/_matrix/client/v3/rooms/${enc(data.room)}/messages?dir=b&limit=100`)).chunk.find((e) => e.content?.body === 'first message from bob')
    await api(data.bob.token, 'PUT', `/_matrix/client/v3/rooms/${enc(data.room)}/send/m.reaction/bobr1`, { 'm.relates_to': { rel_type: 'm.annotation', event_id: first.event_id, key: '👍' } })
    const row = page.locator('article', { hasText: 'first message from bob' })
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForFunction(() => !document.querySelector('.sentinel')?.textContent?.trim())
    const chip = row.locator('.reacts button', { hasText: '👍' })
    await page.waitForFunction(() => [...document.querySelectorAll('article .reacts button')].some((b) => b.textContent.includes('👍') && b.textContent.includes('2')), null, { timeout: 15_000 })
    const who = await chip.getAttribute('data-who')
    assert.ok(who.includes('You') && who.includes(data.bob.name), who)
    assert.equal(await chip.getAttribute('aria-pressed'), 'true')
    assert.match(await chip.getAttribute('aria-label'), new RegExp(`${data.bob.name}`))
    await chip.click()
    await page.waitForFunction((n) => {
      const b = [...document.querySelectorAll('article .reacts button')].find((x) => x.textContent.includes('👍'))
      return b && b.textContent.includes('1') && b.getAttribute('aria-pressed') === 'false' && b.dataset.who === n
    }, data.bob.name, { timeout: 15_000 })
  })

  it('passes axe in every theme with the views menu open, a muted room and reaction chips shown', async () => {
    await page.evaluate(axeSource)
    await rooms().getByRole('button', { name: /e2e room/ }).click()
    await page.getByRole('radio', { name: 'Mute' }).click()
    await page.locator('aside header .switch').click()
    for (const theme of THEMES) {
      const bad = await page.evaluate(async (t) => {
        document.documentElement.dataset.theme = t
        const res = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })
        return res.violations.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`)
      }, theme)
      assert.deepEqual(bad, [], `${theme}: ${bad.join('; ')}`)
    }
  })
})
