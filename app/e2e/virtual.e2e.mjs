import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, register, send, signIn } from './lib.mjs'

// A room long enough for the virtualised timeline (more than 200 rows).
describe('a long room', () => {
  let server, browser, alice, room, page
  const enc = encodeURIComponent
  const N = 600
  const drawn = () => page.locator('.rows article[data-id]').count()
  const scroller = (fn, arg) => page.evaluate(fn, arg)

  before(async () => {
    server = await app()
    browser = await launch()
    alice = await register(`long_${Math.random().toString(36).slice(2, 8)}`)
    room = (await api(alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'long room', preset: 'private_chat' })).room_id
    // send in parallel batches: 600 messages
    for (let i = 1; i <= N; i += 25) await Promise.all(Array.from({ length: Math.min(25, N - i + 1) }, (_, k) => send(alice, room, { msgtype: 'm.text', body: `message number ${String(i + k).padStart(4, '0')}` })))
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await signIn(page, server.url, alice)
    await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /long room/ }).first().click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  async function loadAll() {
    // scroll to the top repeatedly until the start of the conversation shows
    for (let i = 0; i < 80; i++) {
      await page.mouse.move(640, 400)
      await page.mouse.wheel(0, -4000)
      await page.waitForTimeout(300)
      if (await page.getByText('This is the beginning of the conversation.').count()) return
    }
    throw new Error('never reached the start of the conversation')
  }

  it('draws only a window of the rows, however many are loaded', async () => {
    await loadAll()
    const total = await page.evaluate(() => document.querySelector('.scroll').scrollHeight)
    assert.ok(total > 600 * 20, 'the scroll height still stands for all the messages')
    assert.ok((await drawn()) < 260, `drew ${await drawn()} rows`)
  })

  it('scrolling to the bottom shows the newest message, and back up shows the oldest', async () => {
    await scroller(() => { const s = document.querySelector('.scroll'); s.scrollTop = s.scrollHeight })
    await page.getByText('message number 0600', { exact: true }).waitFor({ timeout: 10_000 })
    assert.ok((await drawn()) < 260)
    await scroller(() => { const s = document.querySelector('.scroll'); s.scrollTop = 0 })
    await page.getByText('message number 0001', { exact: true }).waitFor({ timeout: 10_000 })
  })

  it('a message far from the window can be jumped to, and a new message sticks to the bottom', async () => {
    await page.getByRole('button', { name: 'Jump to…' }).click()
    const day = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
    await page.getByLabel('Jump to a date').fill(day)
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await page.getByText('message number 0001', { exact: true }).waitFor({ timeout: 15_000 })
    // the jump finishes by centring the target and flashing it; let that settle before moving on
    await page.waitForFunction(() => !document.querySelector('.rows article.flash') && document.querySelectorAll('.rows article[data-id]').length > 0, null, { timeout: 8000 })
    await page.waitForTimeout(400)
    // go to the bottom, then a new message arrives and is shown without scrolling
    await scroller(() => { const s = document.querySelector('.scroll'); s.scrollTop = s.scrollHeight })
    await page.getByText('message number 0600', { exact: true }).waitFor({ timeout: 8000 })
    await send(alice, room, { msgtype: 'm.text', body: 'a brand new message' })
    await page.getByText('a brand new message', { exact: true }).waitFor({ timeout: 15_000 }).catch(async (e) => { throw new Error(e.message + ' | ' + JSON.stringify(await page.evaluate(() => { const s = document.querySelector('.scroll'); return { drawn: document.querySelectorAll('.rows article[data-id]').length, sh: s.scrollHeight, st: s.scrollTop, ch: s.clientHeight, pads: [...document.querySelectorAll('.vpad')].map((e) => e.style.height), last: [...document.querySelectorAll('.rows article[data-id] .text')].at(-1)?.textContent } }))) })
    const gap = await page.evaluate(() => { const s = document.querySelector('.scroll'); return s.scrollHeight - s.scrollTop - s.clientHeight })
    assert.ok(gap < 120, `stayed at the bottom (gap ${gap})`)
  })

  it('does not jump while scrolling up through unmeasured rows', async () => {
    await scroller(() => { const s = document.querySelector('.scroll'); s.scrollTop = s.scrollHeight })
    await page.waitForTimeout(300)
    // pick the message in the middle of the screen and scroll up in small steps: it must move by what we scrolled, give or take
    let worst = 0
    for (let i = 0; i < 12; i++) {
      const before = await page.evaluate(() => { const s = document.querySelector('.scroll'); const r = s.getBoundingClientRect(); const a = [...document.querySelectorAll('.rows article[data-id]')].find((x) => x.getBoundingClientRect().top > r.top + r.height / 2); return { id: a.dataset.id, top: a.getBoundingClientRect().top } })
      await page.mouse.move(640, 400)
      await page.mouse.wheel(0, -300)
      await page.waitForTimeout(250)
      const after = await page.evaluate((id) => document.querySelector(`.rows article[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect().top, before.id)
      if (after !== undefined) worst = Math.max(worst, Math.abs(after - before.top - 300))
    }
    assert.ok(worst < 60, `content moved ${worst}px more than the scroll`)
  })
})
