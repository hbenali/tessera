import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { generateKeyPairSync } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { api, app, launch, seed, send, signIn } from './lib.mjs'

// A real P-256 public key in the form a browser wants (65 bytes, base64url).
const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
const VAPID = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url')
const GATEWAY_HOST = process.env.PUSH_GATEWAY_HOST ?? '172.17.0.1' // how Synapse (in Docker) reaches this machine
const ENDPOINT = 'https://push.example.test/send/e2e'

describe('web push and PWA', () => {
  let server, browser, data, ctx, page, gateway, received
  const enc = encodeURIComponent
  const pushers = async () => (await api(data.alice.token, 'GET', '/_matrix/client/v3/pushers')).pushers

  before(async () => {
    server = await app()
    browser = await launch()
    data = await seed()
    received = []
    gateway = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try { received.push(JSON.parse(body)) } catch { /* ignore */ }
        res.setHeader('Content-Type', 'application/json')
        res.end('{"rejected":[]}')
      })
    })
    await new Promise((r) => gateway.listen(0, '0.0.0.0', r))
  })
  after(async () => {
    await browser?.close()
    gateway?.close()
    server?.stop()
  })

  const gatewayUrl = () => `http://${GATEWAY_HOST}:${gateway.address().port}/_matrix/push/v1/notify`

  async function open({ configured }) {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await ctx.grantPermissions(['notifications'], { origin: server.url })
    // The browser's own push service needs Google's servers; a stand-in subscription keeps this test offline-safe.
    await ctx.addInitScript(() => {
      const key = (n) => Uint8Array.from({ length: n === 'p256dh' ? 65 : 16 }, (_, i) => (i * 7 + n.length) % 256).buffer
      const load = () => { try { return JSON.parse(localStorage.getItem('fakeSub')) } catch { return null } }
      const wrap = (o) => o && { endpoint: o.endpoint, options: { applicationServerKey: Uint8Array.from(atob(o.key), (c) => c.charCodeAt(0)).buffer }, getKey: key, unsubscribe: async () => { localStorage.removeItem('fakeSub'); return true } }
      PushManager.prototype.getSubscription = async () => wrap(load())
      PushManager.prototype.subscribe = async (opts) => {
        const key = btoa(String.fromCharCode(...new Uint8Array(opts.applicationServerKey)))
        localStorage.setItem('fakeSub', JSON.stringify({ endpoint: 'https://push.example.test/send/e2e', key }))
        return wrap(load())
      }
    })
    page = await ctx.newPage()
    if (configured) await ctx.route('**/config.json', (r) => r.fulfill({ json: { push: { gateway: gatewayUrl(), vapidPublicKey: VAPID } } }))
    await signIn(page, server.url, data.alice)
    await page.evaluate(() => navigator.serviceWorker.ready)
  }
  async function notifySettings() {
    await page.locator('footer .me').click()
    await page.getByRole('menuitem', { name: 'Profile and settings' }).click()
    await page.getByRole('tab', { name: 'Notifications' }).click()
  }

  it('explains that push needs a gateway when the deployment has none', async () => {
    await open({ configured: false })
    await notifySettings()
    await page.getByText(/need a push gateway/).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Turn on' }).count(), 0)
    await ctx.close()
  })

  it('serves a manifest with a maskable icon and a service worker', async () => {
    const c = await browser.newContext()
    const p = await c.newPage()
    await p.goto(server.url)
    const m = await (await p.request.get(`${server.url}/manifest.webmanifest`)).json()
    assert.ok(m.icons.some((i) => i.purpose === 'maskable'))
    for (const i of m.icons) assert.equal((await p.request.get(server.url + i.src)).status(), 200, i.src)
    assert.equal((await p.request.get(`${server.url}/sw.js`)).status(), 200)
    await c.close()
  })

  it('registers a Matrix pusher for this browser when turned on, and keeps it across a reload', async () => {
    await open({ configured: true })
    await notifySettings()
    await page.getByRole('button', { name: 'Turn on' }).click()
    await page.getByText(/On: you will be notified/).waitFor({ timeout: 15_000 })
    const [p] = await pushers()
    assert.equal(p.kind, 'http')
    assert.equal(p.app_id, 'ovh.hbenali.tessera.web')
    assert.match(p.pushkey, /^[A-Za-z0-9_-]{86,88}$/)
    assert.equal(p.data.url, gatewayUrl())
    assert.equal(p.data.format, 'event_id_only')
    assert.equal(p.data.endpoint, ENDPOINT)
    assert.equal(p.data.events_only, true)
    assert.ok(p.data.auth)
    await page.reload()
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor()
    await notifySettings()
    await page.getByText(/On: you will be notified/).waitFor({ timeout: 15_000 })
  })

  it('stores the session for the worker only while push is on', async () => {
    const has = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('tessera-push', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(!!g.result?.accessToken) } }))
    assert.equal(await has(), true)
  })

  it('has the homeserver send events to the gateway', { skip: !process.env.PUSH_GATEWAY_TEST && 'set PUSH_GATEWAY_TEST=1 (Synapse needs ip_range_whitelist for the gateway)' }, async () => {
    received.length = 0
    const sent = await send(data.bob, data.room, { msgtype: 'm.text', body: 'ping the gateway' })
    for (let i = 0; i < 30 && !received.length; i++) await new Promise((r) => setTimeout(r, 500))
    assert.ok(received.length, 'the gateway was never called')
    const n = received.at(-1).notification
    assert.equal(n.event_id, sent.event_id)
    assert.equal(n.room_id, data.room)
    assert.equal(n.content, undefined, 'event_id_only must not carry the message text')
    assert.equal(n.devices[0].app_id, 'ovh.hbenali.tessera.web')
    assert.equal(n.devices[0].data.endpoint, ENDPOINT)
  })

  it('turns a push into a readable notification in the service worker', async () => {
    const sent = await send(data.bob, data.room, { msgtype: 'm.text', body: 'lunch at noon?' })
    // Nobody may be looking at the app, or the worker rightly shows nothing: close it and deliver from a blank page.
    await page.close()
    const blank = await ctx.newPage()
    const cdp = await ctx.newCDPSession(blank)
    const regs = []
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations))
    await cdp.send('ServiceWorker.enable')
    await new Promise((r) => setTimeout(r, 500))
    const reg = regs.find((r) => r.scopeURL.startsWith(server.url))
    assert.ok(reg, 'no service worker registration found')
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: server.url, registrationId: reg.registrationId, data: JSON.stringify({ notification: { event_id: sent.event_id, room_id: data.room } }) })
    page = await ctx.newPage()
    await page.goto(server.url)
    const note = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready
      for (let i = 0; i < 30; i++) {
        const list = await r.getNotifications()
        if (list.length) return { title: list[0].title, body: list[0].body, data: list[0].data, tag: list[0].tag, icon: list[0].icon, actions: list[0].actions.map((a) => a.action) }
        await new Promise((res) => setTimeout(res, 200))
      }
      return null
    })
    assert.ok(note, 'no notification was shown')
    assert.match(note.title, new RegExp(data.bob.name))
    assert.match(note.title, /e2e room/)
    assert.equal(note.body, 'lunch at noon?')
    assert.equal(note.data.room_id, data.room)
    assert.deepEqual(note.actions, ['like'], 'readable messages offer a Like action')
    assert.match(note.icon, /^data:image\/png;base64,/, "the sender's avatar is the notification icon")
    await blank.close()
  })

  it('likes the message from the notification with the stored session', async () => {
    const sent = await send(data.bob, data.room, { msgtype: 'm.text', body: 'quick like please' })
    await page.evaluate(async ([room, event]) => (await navigator.serviceWorker.ready).active.postMessage({ type: 'like', room_id: room, event_id: event }), [data.room, sent.event_id])
    let mine
    for (let i = 0; i < 30 && !mine; i++) {
      const rel = await api(data.alice.token, 'GET', `/_matrix/client/v1/rooms/${enc(data.room)}/relations/${enc(sent.event_id)}/m.annotation`)
      mine = rel.chunk.find((e) => e.sender === data.alice.id && e.content['m.relates_to'].key === '👍')
      if (!mine) await new Promise((r) => setTimeout(r, 300))
    }
    assert.ok(mine, 'the reaction was not sent')
  })

  it('offers no Like for an event the worker cannot read, such as an encrypted one', async () => {
    const { room_id } = await api(data.bob.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'secret', invite: [data.alice.id], preset: 'private_chat', initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] })
    await api(data.alice.token, 'POST', `/_matrix/client/v3/join/${enc(room_id)}`, {})
    const sent = await api(data.bob.token, 'PUT', `/_matrix/client/v3/rooms/${enc(room_id)}/send/m.room.encrypted/enc1`, { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'x', device_id: 'X', sender_key: 'Y', session_id: 'Z' })
    await ctx.pages()[0].close().catch(() => {})
    const blank = await ctx.newPage()
    const cdp = await ctx.newCDPSession(blank)
    const regs = []
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations))
    await cdp.send('ServiceWorker.enable')
    await new Promise((r) => setTimeout(r, 500))
    const reg = regs.find((r) => r.scopeURL.startsWith(server.url))
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: server.url, registrationId: reg.registrationId, data: JSON.stringify({ notification: { event_id: sent.event_id, room_id } }) })
    page = await ctx.newPage()
    await page.goto(server.url)
    const note = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready
      for (let i = 0; i < 30; i++) {
        const list = (await r.getNotifications()).filter((n) => n.body === 'Encrypted message')
        if (list.length) return { body: list[0].body, actions: list[0].actions.map((a) => a.action) }
        await new Promise((res) => setTimeout(res, 200))
      }
      return null
    })
    assert.ok(note, 'no notification for the encrypted event')
    assert.deepEqual(note.actions, [])
    await blank.close()
  })

  it('opens the room when the worker asks the window to', async () => {
    await page.getByRole('navigation', { name: 'Rooms' }).waitFor({ timeout: 30_000 })
    await page.evaluate((room) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'open', hash: `#/room/${encodeURIComponent(room)}` } })), data.room)
    await page.getByRole('combobox', { name: 'Message' }).waitFor({ timeout: 15_000 })
    assert.equal(await page.locator('main header h1').innerText(), 'e2e room')
  })

  it('ignores a message that is not a room link', async () => {
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'open', hash: 'javascript:alert(1)' } })))
    assert.match(await page.evaluate(() => location.hash), /^#\/room\//)
  })

  it('removes the pusher, the subscription and the stored session when turned off', async () => {
    await notifySettings()
    await page.getByRole('button', { name: 'Turn off' }).click()
    await page.getByText('Off.', { exact: true }).waitFor({ timeout: 15_000 })
    assert.deepEqual(await pushers(), [])
    assert.equal(await page.evaluate(() => localStorage.getItem('fakeSub')), null)
    const has = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('tessera-push', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(!!g.result) } }))
    assert.equal(has, false)
  })
})
