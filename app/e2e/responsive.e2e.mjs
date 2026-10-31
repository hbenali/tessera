import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, register, send, signIn, upload } from './lib.mjs'

// Every room layout at every common width, with the content that breaks layouts: an unbroken 200-character word, a code block,
// a long link, a reply, reactions, an image, a file, a poll, a location and a long message. Nothing may be cut off or scroll sideways.
const WIDTHS = [320, 390, 768, 1024, 1280, 1920]
const LAYOUTS = ['classic', 'aligned', 'cards', 'lines']
const SHOTS = process.env.SHOTS_DIR

describe('room layouts at every width', () => {
  let server, browser, alice, bob, room, page
  const enc = encodeURIComponent
  before(async () => {
    server = await app()
    browser = await launch()
    alice = await register(`resp_a_${Math.random().toString(36).slice(2, 7)}`)
    bob = await register(`resp_bob_with_a_rather_long_user_name_${Math.random().toString(36).slice(2, 7)}`)
    room = (await api(alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'responsive room', invite: [bob.id], preset: 'private_chat' })).room_id
    await api(bob.token, 'POST', `/_matrix/client/v3/join/${enc(room)}`, {})
    const icon = new URL('../public/icon-512.png', import.meta.url).pathname
    const mxc = await upload(bob, icon, 'image/png')
    const ev = (u, type, content) => api(u.token, 'PUT', `/_matrix/client/v3/rooms/${enc(room)}/send/${type}/${Math.random().toString(36).slice(2)}`, content)
    const first = await send(bob, room, { msgtype: 'm.text', body: 'Release notes are ready. ' + 'This is a deliberately long message that goes on and on to make sure the text wraps inside its bubble, its card or its line and never pushes the layout wider than the screen. '.repeat(2) })
    await send(bob, room, { msgtype: 'm.text', body: 'x'.repeat(200) })
    await send(bob, room, { msgtype: 'm.text', body: 'a long link https://example.org/a/really/long/path/that/keeps/going/and/going/and/going/forever/and/ever?with=query&and=more&and=even-more#fragment' })
    await send(alice, room, { msgtype: 'm.text', body: 'Here is some code:\n```\nconst veryLongVariableName = someFunction(argumentNumberOne, argumentNumberTwo, argumentNumberThree)\n```' })
    await send(alice, room, { msgtype: 'm.text', body: 'A reply from me', 'm.relates_to': { 'm.in_reply_to': { event_id: first.event_id } } })
    await ev(alice, 'm.reaction', { 'm.relates_to': { rel_type: 'm.annotation', event_id: first.event_id, key: '👍' } })
    await ev(bob, 'm.reaction', { 'm.relates_to': { rel_type: 'm.annotation', event_id: first.event_id, key: '🎉' } })
    await send(bob, room, { msgtype: 'm.image', body: 'icon.png', url: mxc, info: { mimetype: 'image/png', w: 512, h: 512 } })
    await send(bob, room, { msgtype: 'm.file', body: 'quarterly-report-with-a-very-long-file-name-final-v2.pdf', url: mxc, info: { mimetype: 'application/pdf', size: 123456 } })
    await ev(alice, 'm.poll.start', { body: 'Lunch?', 'm.poll': { kind: 'm.poll.disclosed', max_selections: 1, question: { 'm.text': [{ mimetype: 'text/plain', body: 'Where shall we have lunch today, somewhere nearby?' }] }, answers: [{ id: 'a1', 'm.text': [{ mimetype: 'text/plain', body: 'Pizza' }] }, { id: 'a2', 'm.text': [{ mimetype: 'text/plain', body: 'Sushi, the one with the very long name near the station' }] }] } })
    await send(bob, room, { msgtype: 'm.location', body: 'Location 48.85837, 2.29448', geo_uri: 'geo:48.858370,2.294481' })
    await send(alice, room, { msgtype: 'm.text', body: 'Thanks @' + bob.name + ':localhost, that is all from me.' })
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  for (const w of WIDTHS) {
    describe(`${w}px wide`, () => {
      before(async () => {
        page = await (await browser.newContext({ viewport: { width: w, height: w < 500 ? 780 : 860 }, hasTouch: w < 500, isMobile: w < 500 })).newPage()
        await signIn(page, server.url, alice)
        await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button', { name: /responsive room/ }).first().click()
        await page.getByRole('combobox', { name: 'Message' }).waitFor()
        await page.locator('.rows article[data-id]').nth(5).waitFor({ timeout: 20_000 })
        await page.locator('.rows img').first().waitFor({ timeout: 15_000 }).catch(() => {})
        await page.waitForTimeout(600)
      })
      for (const layout of LAYOUTS) {
        it(layout, async () => {
          // the layouts are CSS keyed on data-layout, so switching the attribute shows exactly what the app would draw
          await page.evaluate((l) => { document.querySelector('.scroll').setAttribute('data-layout', l) }, layout)
          await page.waitForTimeout(250)
          const r = await page.evaluate(() => {
            const s = document.querySelector('.scroll'); const sb = s.getBoundingClientRect()
            const bad = []
            for (const e of s.querySelectorAll('article *')) {
              if (e.closest('.tools, [aria-hidden=true]')) continue
              // a code block may be wider than the screen as long as it scrolls inside its own box
              if (e.closest('pre') && e.tagName !== 'PRE') { continue }
              if (e.tagName === 'PRE' && !['auto', 'scroll'].includes(getComputedStyle(e).overflowX)) bad.push('PRE does not scroll')
              const b = e.getBoundingClientRect()
              if (b.width > 0 && (b.right > sb.right + 1 || b.left < sb.left - 1)) bad.push(`${e.tagName}.${(e.className?.toString?.() ?? '').split(' ')[0]} ${Math.round(b.left)}..${Math.round(b.right)}`)
            }
            const title = document.querySelector('.title h1')?.getBoundingClientRect().width ?? 0
            const comp = document.querySelector('[role=combobox]')?.getBoundingClientRect()
            return { page: document.documentElement.scrollWidth, w: innerWidth, scrollX: s.scrollWidth - s.clientWidth, bad: [...new Set(bad)].slice(0, 5), title, compOk: !!comp && comp.right <= innerWidth + 1 && comp.left >= -1 }
          })
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/${layout}-${w}.png` })
          assert.ok(r.page <= r.w + 1, `the page scrolls sideways: ${r.page} > ${r.w}`)
          assert.ok(r.scrollX <= 1, `the timeline scrolls sideways by ${r.scrollX}px`)
          assert.deepEqual(r.bad, [], `content past the edge of the timeline`)
          assert.ok(r.title > 50, `the room title has ${Math.round(r.title)}px`)
          assert.ok(r.compOk, 'the message box is inside the screen')
        })
      }
    })
  }
})
