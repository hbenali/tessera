import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { app, launch, seed, send, signIn } from './lib.mjs'

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const THEMES = ['dark', 'light', 'sand', 'forest', 'ocean', 'midnight', 'contrast']

describe('tessera e2e', () => {
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

  async function openRoom(viewport = { width: 1280, height: 720 }) {
    const ctx = await browser.newContext({ viewport })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await signIn(page, server.url, data.alice)
    await page.getByRole('button', { name: /e2e room/ }).click()
    await page.getByRole('combobox', { name: 'Message' }).waitFor()
    // The image is fetched with the access token and shown from a blob URL.
    await page.waitForFunction(() => [...document.querySelectorAll('article .body img')].some((i) => i.naturalWidth > 0), null, { timeout: 15_000 })
    await page.waitForTimeout(300)
    return { page, ctx, errors }
  }

  describe('login page', () => {
    it('does not load the Matrix SDK', async () => {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const files = []
      page.on('response', (r) => r.url().endsWith('.js') || r.url().endsWith('.wasm') ? files.push(r.url()) : 0)
      await page.goto(server.url)
      await page.getByRole('heading', { name: 'Sign in' }).waitFor()
      assert.deepEqual(files.filter((f) => /indexeddb-crypto|wasm/.test(f)), [])
      await ctx.close()
    })
  })

  describe('room view (desktop)', () => {
    let r
    before(async () => { r = await openRoom() })
    after(() => r?.ctx.close())

    it('keeps the composer on screen and the page from scrolling', async () => {
      const m = await r.page.evaluate(() => ({
        doc: document.scrollingElement.scrollHeight,
        win: innerHeight,
        composer: document.querySelector('.composer').getBoundingClientRect().bottom,
      }))
      assert.equal(m.doc, m.win, 'document must not be taller than the window')
      assert.ok(m.composer <= m.win, 'composer must be inside the window')
    })

    it('shows the newest message after the image has loaded', async () => {
      const ok = await r.page.evaluate(() => {
        const s = document.querySelector('.scroll')
        const last = [...document.querySelectorAll('article')].pop().getBoundingClientRect()
        const box = s.getBoundingClientRect()
        return last.top >= box.top && last.bottom <= box.bottom + 1
      })
      assert.ok(ok)
    })

    it('shows avatars for the room and for people', async () => {
      const n = await r.page.evaluate(() => [...document.querySelectorAll('.av img')].filter((i) => i.naturalWidth > 0).length)
      assert.ok(n >= 3, `expected loaded avatar images, got ${n}`)
    })

    it('renders mentions as pills and highlights messages that mention you', async () => {
      const pills = await r.page.locator('.text .mention').allTextContents()
      assert.ok(pills.includes(`@${data.bob.name}`) || pills.some((p) => p.startsWith('@')), pills.join())
      assert.equal(await r.page.locator('article.mention').count(), 1)
      const raw = await r.page.locator('article .text').allTextContents()
      assert.ok(!raw.some((t) => t.includes(':localhost')), 'no raw user ids in message text')
    })

    it('shows names, not ids, in the room list preview', async () => {
      const preview = await r.page.getByRole('navigation', { name: 'Rooms' }).innerText()
      assert.ok(!/@\S+:localhost/.test(preview), preview)
    })

    it('does not clip the hover toolbar or the emoji picker', async () => {
      // A row inside the view (a toolbar hanging off the very top edge of the list is cut by the list itself).
    const first = r.page.locator('article', { hasText: 'hello bob' })
    await first.scrollIntoViewIfNeeded()
    await r.page.locator('.scroll').evaluate((s) => { s.scrollTop = Math.max(0, s.scrollTop - 80) })
      await first.hover()
      const tools = first.locator('.tools')
      await tools.waitFor()
      const clipped = await tools.evaluate((el) => {
        const b = el.getBoundingClientRect()
        // Probe the straight edges (corners are rounded): top and bottom middle, left and right middle.
        const mid = b.left + b.width / 2, side = b.top + b.height / 2
        return [[mid, b.top + 2], [mid, b.bottom - 2], [b.left + 2, side], [b.right - 2, side]].map(([x, y]) => { const h = document.elementFromPoint(x, y); return el.contains(h) ? null : `${Math.round(x)},${Math.round(y)} hit ${h?.tagName}.${h?.className}` }).filter(Boolean)
      })
      assert.deepEqual(clipped, [], 'every edge of the toolbar must be on top')
      await first.getByRole('button', { name: 'More reactions' }).click()
      const picker = r.page.getByRole('dialog', { name: 'Emoji picker' })
      await picker.waitFor()
      const box = await picker.boundingBox()
      assert.ok(box.y >= 0 && box.y + box.height <= 720, `picker must fit in the window: ${JSON.stringify(box)}`)
      assert.ok(await picker.getByText('Frequent').isVisible(), 'first category heading must be visible')
      await r.page.keyboard.press('Escape')
    })

    it('shows reaction chips with their emoji and count intact', async () => {
      const chip = r.page.locator('.reacts button').first()
      const box = await chip.boundingBox()
      assert.ok(box.height >= 22 && box.width >= 34, JSON.stringify(box))
      assert.match(await chip.innerText(), /👍\s*1/)
    })

    it('offers @ autocomplete and sends structured mentions', async () => {
      const box = r.page.getByRole('combobox', { name: 'Message' })
      await box.fill(`ping @${data.bob.name.slice(0, 6)}`)
      await r.page.getByRole('listbox', { name: 'Mention suggestions' }).waitFor()
      await box.press('Tab')
      assert.ok((await box.inputValue()).includes(data.bob.id))
      await box.press('Enter')
      await r.page.waitForFunction((t) => document.querySelector('article:last-of-type .text')?.textContent.includes(t), 'ping', { timeout: 10_000 })
      const synapse = process.env.SYNAPSE_URL ?? 'http://localhost:8008'
    let sent
    for (let i = 0; i < 20 && !sent; i++) {
      const res = await (await fetch(`${synapse}/_matrix/client/v3/rooms/${encodeURIComponent(data.room)}/messages?dir=b&limit=5`, { headers: { Authorization: `Bearer ${data.bob.token}` } })).json()
      sent = res.chunk.find((e) => e.type === 'm.room.message' && e.content.body?.startsWith('ping'))
      if (!sent) await new Promise((r) => setTimeout(r, 250))
    }
    assert.ok(sent, 'the message reached the server')
    assert.deepEqual(sent.content['m.mentions'], { user_ids: [data.bob.id] }, JSON.stringify(sent.content))
    })

    it('lets you scroll down from the top of the history without snapping back', async () => {
      const list = r.page.locator('.scroll')
      // Page back until the start of the room is reached.
      for (let i = 0; i < 30; i++) {
        await list.evaluate((s) => { s.scrollTop = 0 })
        await r.page.waitForTimeout(300)
        if (await r.page.getByText('older message 1', { exact: true }).count()) break
      }
      assert.ok(await r.page.getByText('older message 1', { exact: true }).count(), 'the whole history is loaded')
      await list.evaluate((s) => { s.scrollTop = 0 })
      await r.page.waitForTimeout(500)
      await r.page.mouse.move(700, 300)
      for (let i = 0; i < 4; i++) { await r.page.mouse.wheel(0, 20); await r.page.waitForTimeout(120) } // a trackpad-sized drift
      await r.page.waitForTimeout(1200)
      const top = await list.evaluate((s) => s.scrollTop)
      assert.ok(top >= 60, `scrolled ${top}px and must stay there, not be reset to the top`)
    })

    it('shows who has seen your latest message', async () => {
      const synapse = process.env.SYNAPSE_URL ?? 'http://localhost:8008'
      const res = await (await fetch(`${synapse}/_matrix/client/v3/rooms/${encodeURIComponent(data.room)}/messages?dir=b&limit=10`, { headers: { Authorization: `Bearer ${data.bob.token}` } })).json()
      const mine = res.chunk.find((e) => e.type === 'm.room.message' && e.sender === data.alice.id)
      await fetch(`${synapse}/_matrix/client/v3/rooms/${encodeURIComponent(data.room)}/receipt/m.read/${encodeURIComponent(mine.event_id)}`, { method: 'POST', headers: { Authorization: `Bearer ${data.bob.token}`, 'Content-Type': 'application/json' }, body: '{}' })
      await r.page.locator('.seen').waitFor({ timeout: 10_000 })
      assert.match(await r.page.locator('.seen').getAttribute('title'), new RegExp(`Seen by ${data.bob.name}`))
    })

    it('uploads an image pasted into the composer', async () => {
      const before = await r.page.locator('article .body img').count()
      await r.page.getByRole('combobox', { name: 'Message' }).evaluate((el) => {
        const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      })
      await r.page.waitForFunction((n) => document.querySelectorAll('article .body img').length > n, before, { timeout: 15_000 })
    })

    it('keeps an unsent draft across a reload', async () => {
      const box = r.page.getByRole('combobox', { name: 'Message' })
      await box.fill('a draft worth keeping')
      await r.page.reload()
      await r.page.getByRole('button', { name: /e2e room/ }).click()
      assert.equal(await r.page.getByRole('combobox', { name: 'Message' }).inputValue(), 'a draft worth keeping')
      await r.page.getByRole('combobox', { name: 'Message' }).fill('')
    })

    it('has no console errors', () => assert.deepEqual(r.errors, []))

    it('passes axe (WCAG 2.1 A/AA) in every theme', async () => {
      await r.page.addScriptTag({ content: axeSource })
      await r.page.getByRole('button', { name: 'Room details' }).click()
      for (const theme of THEMES) {
        const bad = await r.page.evaluate(async (t) => {
          document.documentElement.dataset.theme = t
          const res = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })
          return res.violations.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`)
        }, theme)
        assert.deepEqual(bad, [], `${theme}: ${bad.join('; ')}`)
      }
    })
  })

  describe('room view (phone)', () => {
    it('fits a 390x844 screen, composer included, with no sideways scroll', async () => {
      const r = await openRoom({ width: 390, height: 844 })
      const m = await r.page.evaluate(() => ({
        doc: document.scrollingElement.scrollHeight,
        win: innerHeight,
        wide: document.scrollingElement.scrollWidth > innerWidth,
        composer: document.querySelector('.composer').getBoundingClientRect().bottom,
      }))
      assert.equal(m.doc, m.win)
      assert.equal(m.wide, false)
      assert.ok(m.composer <= m.win)
      await r.page.getByRole('button', { name: /back/i }).click()
      await r.page.getByRole('navigation', { name: 'Rooms' }).waitFor()
      await r.ctx.close()
    })
  })

  describe('notifications', () => {
    it('stores the per-room level as push rules and reads it back', async () => {
      const { page, ctx } = await openRoom()
      await page.getByRole('button', { name: 'Room details' }).click()
      for (const [label, expected] of [['Mute', 'mute'], ['Mentions', 'mentions'], ['All', 'all']]) {
        await page.getByRole('radio', { name: label }).click()
        await page.waitForFunction(([id, lvl]) => document.querySelector('[role=radio][aria-checked=true]')?.textContent === lvl, [data.room, label], { timeout: 5000 })
        let problem
      for (let i = 0; i < 20; i++) {
        const rules = await (await fetch(`${process.env.SYNAPSE_URL ?? 'http://localhost:8008'}/_matrix/client/v3/pushrules/`, { headers: { Authorization: `Bearer ${data.alice.token}` } })).json()
        const inOverride = rules.global.override.some((x) => x.rule_id === data.room)
        const inRoom = rules.global.room.some((x) => x.rule_id === data.room)
        problem = inOverride === (expected === 'mute') && inRoom === (expected === 'mentions') ? null : `${expected}: override=${inOverride} room=${inRoom}`
        if (!problem) break
        await new Promise((r) => setTimeout(r, 250))
      }
      assert.equal(problem, null)
    }
    await ctx.close()
    })
  })
})
