// Shared helpers for the browser tests: a throwaway Synapse account pair, a static server and Chrome.
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

export const SYNAPSE = process.env.SYNAPSE_URL ?? 'http://localhost:8008'
export const PASSWORD = 'e2e-pass-1234!'
const here = new URL('.', import.meta.url).pathname

async function api(token, method, path, body, type = 'application/json') {
  const res = await fetch(`${SYNAPSE}${path}`, {
    method,
    headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`)
  return json
}

/**
 * Creates a user. With SYNAPSE_REGISTRATION_SECRET (homeserver.yaml: registration_shared_secret) it uses the
 * admin endpoint; otherwise it needs a homeserver with open registration.
 */
export async function register(name) {
  const secret = process.env.SYNAPSE_REGISTRATION_SECRET
  if (secret) {
    const { nonce } = await (await fetch(`${SYNAPSE}/_synapse/admin/v1/register`)).json()
    const mac = createHmac('sha1', secret).update(`${nonce}\0${name}\0${PASSWORD}\0notadmin`).digest('hex')
    const r = await api(null, 'POST', '/_synapse/admin/v1/register', { nonce, username: name, password: PASSWORD, admin: false, mac })
    return { name, id: r.user_id, token: r.access_token }
  }
  const r = await api(null, 'POST', '/_matrix/client/v3/register', {
    username: name,
    password: PASSWORD,
    auth: { type: 'm.login.dummy' },
    initial_device_display_name: 'e2e',
  })
  return { name, id: r.user_id, token: r.access_token }
}

export const upload = async (u, file, type) =>
  (await api(u.token, 'POST', `/_matrix/media/v3/upload?filename=${file.split('/').pop()}`, readFileSync(file), type)).content_uri

export const send = (u, room, content, txn = Math.random().toString(36).slice(2)) =>
  api(u.token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(room)}/send/m.room.message/${txn}`, content)

/** alice and bob share an unencrypted room with a mention, an image, a reaction and a thread reply. */
export async function seed() {
  const tag = randomBytes(4).toString('hex')
  const alice = await register(`alice_${tag}`)
  const bob = await register(`bob_${tag}`)
  const icon = `${here}../public/icon-512.png`
  const mxc = await upload(bob, icon, 'image/png')
  await api(bob.token, 'PUT', `/_matrix/client/v3/profile/${bob.id}/avatar_url`, { avatar_url: mxc })
  const { room_id: room } = await api(alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'e2e room', invite: [bob.id], preset: 'private_chat' })
  await api(bob.token, 'POST', `/_matrix/client/v3/join/${encodeURIComponent(room)}`, {})
  await api(alice.token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(room)}/state/m.room.avatar`, { url: mxc })
  // Enough history that the first sync does not include all of it, so scrolling up has to page back.
  for (let i = 1; i <= 45; i++) await send(bob, room, { msgtype: 'm.text', body: `older message ${i}` })
  const first = await send(bob, room, { msgtype: 'm.text', body: 'first message from bob' })
  await send(alice, room, { msgtype: 'm.text', body: 'hello bob' })
  await send(bob, room, { msgtype: 'm.text', body: `hey ${alice.id} can you look?`, 'm.mentions': { user_ids: [alice.id] } })
  await send(bob, room, { msgtype: 'm.image', body: 'icon.png', url: mxc, info: { mimetype: 'image/png', w: 512, h: 512 } })
  await send(alice, room, { msgtype: 'm.text', body: `thanks ${bob.id}`, 'm.mentions': { user_ids: [bob.id] } })
  await api(alice.token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(room)}/send/m.reaction/r1`, {
    'm.relates_to': { rel_type: 'm.annotation', event_id: first.event_id, key: '👍' },
  })
  return { alice, bob, room }
}

/** A room whose last 30+ events are reactions: the first sync window holds no visible message at all. */
export async function seedSparse(alice) {
  const { room_id: room } = await api(alice.token, 'POST', '/_matrix/client/v3/createRoom', { name: 'sparse room', preset: 'private_chat' })
  const msgs = []
  for (let i = 1; i <= 3; i++) msgs.push(await send(alice, room, { msgtype: 'm.text', body: `early message ${i}` }))
  for (let i = 0; i < 40; i++) {
    await api(alice.token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(room)}/send/m.reaction/s${i}`, {
      'm.relates_to': { rel_type: 'm.annotation', event_id: msgs[0].event_id, key: String.fromCodePoint(0x1f600 + i) },
    })
  }
  return room
}

async function reachable(url) {
  try { return (await fetch(url)).ok } catch { return false }
}

/** Use TESSERA_URL if given, otherwise serve the production build with vite preview. */
export async function app() {
  if (process.env.TESSERA_URL) return { url: process.env.TESSERA_URL, stop() {} }
  const url = 'http://localhost:4173'
  if (await reachable(url)) throw new Error('port 4173 is already in use; set TESSERA_URL instead')
  const p = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: `${here}..`, stdio: 'ignore' })
  for (let i = 0; i < 50 && !(await reachable(url)); i++) await new Promise((r) => setTimeout(r, 200))
  if (!(await reachable(url))) { p.kill(); throw new Error('vite preview did not start (run npm run build first)') }
  return { url, stop: () => p.kill() }
}

export const launch = () => chromium.launch({ channel: 'chrome', headless: true })

export async function signIn(page, url, user) {
  await page.goto(url)
  await page.getByLabel('Homeserver').fill(SYNAPSE)
  await page.getByLabel('Username').fill(user.name)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('navigation', { name: 'Rooms' }).waitFor({ timeout: 30_000 })
}
