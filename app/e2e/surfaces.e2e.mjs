import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

// Every modal, menu, popover and panel: it opens, has no accessibility violations (dark and light), stays on the screen
// (desktop and phone), and can be dismissed. One list drives all four checks.
const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const enc = encodeURIComponent

describe('every modal, menu and panel', () => {
  let server, browser, data, dm, desktop, phone
  const pagesOf = {}

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    dm = (await api(data.alice.token, 'POST', '/_matrix/client/v3/createRoom', { is_direct: true, invite: [data.bob.id], preset: 'trusted_private_chat' })).room_id
    await api(data.bob.token, 'POST', `/_matrix/client/v3/join/${enc(dm)}`, {})
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/user/${enc(data.alice.id)}/account_data/m.direct`, { [data.bob.id]: [dm] })
    await send(data.bob, data.room, { msgtype: 'm.text', body: 'a message for the menus https://example.org/page' })
    await api(data.alice.token, 'PUT', `/_matrix/client/v3/user/${enc(data.alice.id)}/rooms/${enc(data.room)}/account_data/m.fully_read`, {}).catch(() => {})
    const mk = async (viewport, touch) => {
      const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, permissions: ['geolocation'], geolocation: { latitude: 1, longitude: 2 } })
      const p = await ctx.newPage()
      await signIn(p, server.url, data.alice)
      return p
    }
    desktop = await mk({ width: 1280, height: 800 }, false)
    phone = await mk({ width: 390, height: 780 }, true)
    pagesOf.desktop = desktop
    pagesOf.phone = phone
  })
  after(async () => {
    await browser?.close()
    server?.stop()
  })

  const rooms = (p) => p.getByRole('navigation', { name: 'Rooms' })
  const press = (p, loc) => (p === phone ? loc.tap() : loc.click())
  async function openRoom(p, re) {
    await press(p, rooms(p).getByRole('button', { name: re }).first())
    await p.getByRole('combobox', { name: 'Message' }).waitFor()
    await p.locator('.rows article[data-id]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  }
  async function backToList(p) {
    if (p === phone) { const b = p.getByRole('button', { name: 'Back to rooms' }); if (await b.isVisible().catch(() => false)) await b.tap() }
  }
  async function settingsTab(p, name) {
    await press(p, p.getByRole('button', { name: 'Settings', exact: true }))
    const d = p.getByRole('dialog', { name: 'Settings' })
    await d.waitFor()
    await press(p, d.getByRole('tab', { name }))
  }
  async function newTab(p, name) {
    await press(p, p.getByRole('button', { name: 'New room or message' }))
    const d = p.getByRole('dialog', { name: 'Start something' })
    await d.waitFor()
    await press(p, d.getByRole('tab', { name }))
  }
  const msgMore = async (p, item) => {
    const m = p.locator('article').filter({ hasText: 'a message for the menus' }).last()
    await m.scrollIntoViewIfNeeded()
    if (p === phone) await m.tap({ position: { x: 6, y: 6 } }); else await m.hover() // a tap on the text could land on the link
    await press(p, m.getByRole('button', { name: 'More actions' }))
    if (item) await press(p, p.getByRole('menuitem', { name: item }))
  }

  /** name, how to open it (given the page), how to find the surface element, how to close it. */
  const surfaces = [
    // ---- menus and popovers
    { name: 'view menu', open: async (p) => press(p, p.locator('aside header .switch')), find: (p) => p.getByRole('listbox', { name: 'Show' }), close: 'Escape-or-toggle' },
    { name: 'status menu', open: async (p) => press(p, p.locator('footer .me')), find: (p) => p.getByRole('menu').filter({ hasText: 'Do not disturb' }), close: 'Escape-or-toggle' },
    { name: 'room list menu (more button)', open: async (p) => { await press(p, rooms(p).getByRole('button', { name: /Options for/ }).first().or(rooms(p).locator('.more').first())) }, find: (p) => p.getByRole('menu', { name: /Options for/ }), close: 'Escape', force: true },
    { name: 'room header menu', in: 'room', open: async (p) => press(p, p.getByRole('button', { name: 'Room menu' })), find: (p) => p.getByRole('menu', { name: /Options for/ }), close: 'Escape' },
    { name: 'message more-actions menu', in: 'room', open: (p) => msgMore(p), find: (p) => p.getByRole('menu', { name: /More actions for this message/ }), close: 'Escape' },
    { name: 'composer attach menu', in: 'room', open: async (p) => press(p, p.getByRole('button', { name: 'Attach or share' })), find: (p) => p.getByRole('menu', { name: 'Attach or share' }), close: 'Escape' },
    { name: 'jump popover', in: 'room', open: async (p) => press(p, p.getByRole('button', { name: 'Jump to…' })), find: (p) => p.getByRole('dialog', { name: 'Jump to' }), close: 'Escape' },
    { name: 'composer emoji picker', in: 'room', open: async (p) => press(p, p.getByRole('button', { name: 'Insert emoji' })), find: (p) => p.locator('.picker, [role=dialog][aria-label*=moji]').first(), close: 'Escape' },
    { name: 'quick switcher (Ctrl K)', open: async (p) => { await p.keyboard.press('Control+k') }, find: (p) => p.getByRole('dialog', { name: 'Search' }), close: 'Escape', desktopOnly: true },
    { name: 'search button on the list', open: async (p) => press(p, p.locator('button.search')), find: (p) => p.getByRole('dialog', { name: 'Search' }), close: 'Escape' },
    { name: 'profile card', in: 'room', open: async (p) => { const m = p.locator('article').filter({ hasText: 'a message for the menus' }).last(); await m.scrollIntoViewIfNeeded(); await press(p, m.locator('.who').first().or(m.locator('button.who')).first()) }, find: (p) => p.getByRole('dialog', { name: /Profile of/ }), close: 'Escape' },
    // ---- settings tabs
    ...['Appearance', 'Security', 'Notifications', 'Privacy', 'Sessions', 'Account', 'About'].map((t) => ({ name: `settings: ${t}`, open: (p) => settingsTab(p, t), find: (p) => p.getByRole('dialog', { name: 'Settings' }), close: 'Close' })),
    // ---- start something tabs
    ...['New room', 'Message someone', 'Join', 'Explore', 'New space'].map((t) => ({ name: `new: ${t}`, open: (p) => newTab(p, t), find: (p) => p.getByRole('dialog', { name: 'Start something' }), close: 'Close' })),
    // ---- message dialogs
    { name: 'forward dialog', in: 'room', open: (p) => msgMore(p, 'Forward'), find: (p) => p.getByRole('dialog', { name: 'Forward message' }), close: 'Close' },
    { name: 'view source dialog', in: 'room', open: (p) => msgMore(p, 'View source'), find: (p) => p.getByRole('dialog', { name: 'Message source' }), close: 'Close' },
    { name: 'report dialog', in: 'room', open: (p) => msgMore(p, 'Report'), find: (p) => p.getByRole('dialog', { name: 'Report message' }), close: 'Close' },
    { name: 'remove dialog', in: 'room', open: (p) => msgMore(p, 'Remove for everyone'), find: (p) => p.getByRole('dialog', { name: 'Remove message' }), close: 'Close' },
    { name: 'poll dialog', in: 'room', open: async (p) => { await press(p, p.getByRole('button', { name: 'Attach or share' })); await press(p, p.getByRole('menuitem', { name: 'Poll' })) }, find: (p) => p.getByRole('dialog', { name: 'Create a poll' }), close: 'Close' },
    { name: 'location dialog', in: 'room', open: async (p) => { await press(p, p.getByRole('button', { name: 'Attach or share' })); await press(p, p.getByRole('menuitem', { name: 'My location' })) }, find: (p) => p.getByRole('dialog', { name: 'Share your location' }), close: 'Close' },
    // ---- panels
    { name: 'reaction picker', in: 'room', open: async (p) => { const m = p.locator('article').filter({ hasText: 'a message for the menus' }).last(); await m.scrollIntoViewIfNeeded(); if (p === phone) await m.tap({ position: { x: 6, y: 6 } }); else await m.hover(); await press(p, m.getByRole('button', { name: 'More reactions' })) }, find: (p) => p.locator('.picker, [role=dialog][aria-label*=moji]').first(), close: 'Escape' },
    { name: 'thread panel', in: 'room', open: async (p) => { const m = p.locator('article').filter({ hasText: 'a message for the menus' }).last(); await m.scrollIntoViewIfNeeded(); if (p === phone) await m.tap({ position: { x: 6, y: 6 } }); else await m.hover(); await press(p, m.getByRole('button', { name: 'Reply in thread' })) }, find: (p) => p.locator('aside[aria-label*="hread"]').first(), close: 'Close thread' },
    { name: 'deactivate confirmation', open: async (p) => { await settingsTab(p, 'Account'); await press(p, p.getByRole('button', { name: 'Deactivate account…' })) }, find: (p) => p.getByRole('dialog', { name: 'Settings' }), close: 'Close' },
    { name: 'room details panel', in: 'room', open: async (p) => press(p, p.getByRole('button', { name: 'Room details' })), find: (p) => p.getByRole('complementary', { name: 'Room details' }), close: 'Close details' },
    { name: 'room search panel', in: 'room', open: async (p) => press(p, p.getByRole('button', { name: 'Search in this room' })), find: (p) => p.locator('aside[aria-label^="Search in"]'), close: 'Close search' },
    { name: 'image viewer', in: 'room', open: async (p) => { const b = p.getByRole('button', { name: /Open image/ }).first(); await b.scrollIntoViewIfNeeded(); await press(p, b) }, find: (p) => p.getByRole('dialog', { name: 'Image viewer' }), close: 'Escape' },
    { name: 'profile card of a person in details', in: 'room', open: async (p) => { await press(p, p.getByRole('button', { name: 'Room details' })); await press(p, p.getByRole('complementary', { name: 'Room details' }).getByRole('button', { name: /bob_/ })) }, find: (p) => p.getByRole('dialog', { name: /Profile of/ }), close: 'Escape', then: 'details' },
  ]

  async function ensureRoom(p, kind) {
    if (kind === 'room') {
      if (!(await p.getByRole('combobox', { name: 'Message' }).isVisible().catch(() => false))) await openRoom(p, /e2e room/)
    } else if (p === phone) {
      await backToList(p)
    }
  }
  async function reset(p) {
    for (let i = 0; i < 3; i++) await p.keyboard.press('Escape')
    // close any side panel and dialog that is still up
    for (const n of ['Close details', 'Close search']) { const b = p.getByRole('button', { name: n }); if (await b.isVisible().catch(() => false)) await (p === phone ? b.tap() : b.click()).catch(() => {}) }
    const close = p.getByRole('button', { name: 'Close', exact: true })
    if (await close.first().isVisible().catch(() => false)) await close.first().click().catch(() => {})
    await p.waitForTimeout(150)
  }

  async function violations(p) {
    await p.evaluate(axeSource)
    return p.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })
      return res.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`)
    })
  }

  for (const [label, key] of [['desktop', 'desktop'], ['phone', 'phone']]) {
    describe(label, () => {
      for (const s of surfaces) {
        if (key === 'phone' && s.desktopOnly) continue
        it(s.name, async () => {
          const p = pagesOf[key]
          await reset(p)
          await ensureRoom(p, s.in ?? 'list')
          await s.open(p)
          const el = s.find(p)
          await el.first().waitFor({ state: 'visible', timeout: 10_000 })

          // stays on the screen
          const box = await el.first().evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth } })
          assert.ok(box.l >= -1 && box.r <= box.w + 1, `${s.name} spans ${Math.round(box.l)}..${Math.round(box.r)} of ${box.w}`)
          assert.ok(box.t >= -1, `${s.name} starts above the screen (${Math.round(box.t)})`)
          assert.ok(box.sw <= box.w + 1, `the page scrolls sideways (${box.sw} > ${box.w})`)

          // accessible, in two themes
          for (const theme of ['dark', 'light']) {
            await p.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
            const v = await violations(p)
            assert.deepEqual(v, [], `${s.name} (${theme})`)
          }
          await p.evaluate(() => document.documentElement.removeAttribute('data-theme'))

          // and it can be dismissed
          if (s.close === 'Escape' || s.close === 'Escape-or-toggle') {
            await p.keyboard.press('Escape')
            await el.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(async () => {
              if (s.close === 'Escape-or-toggle') await (key === 'phone' ? p.locator('aside header .switch, footer .me').first().tap() : p.locator('aside header .switch, footer .me').first().click()).catch(() => {})
            })
          } else {
            const b = el.first().getByRole('button', { name: s.close, exact: true }).or(p.getByRole('button', { name: s.close, exact: true })).first()
            await (key === 'phone' ? b.tap() : b.click())
            await el.first().waitFor({ state: 'hidden', timeout: 5000 })
          }
        })
      }
    })
  }
})
