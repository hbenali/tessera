// Minimal offline shell. Only same-origin GETs are cached; homeserver traffic
// (a different origin) and anything with credentials never touches the cache.
const CACHE = 'tessera-shell-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // Network first so a new deploy shows up; fall back to the cached shell offline.
    e.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    // Hashed build assets never change: cache first.
    e.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()))
        return res
      })),
    )
  }
})

// ---- Web Push -------------------------------------------------------------------------------------------------
// The homeserver sends only an event id through the push gateway. If background notifications are on, the app has
// stored the session in IndexedDB (and removes it when they are turned off), so the text is fetched here, straight
// from the homeserver. Encrypted rooms cannot be read in a worker and show a generic message.
const storedSession = () => stored('session')
function stored(key) {
  return new Promise((resolve) => {
    const r = indexedDB.open('tessera-push', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onerror = () => resolve(null)
    r.onsuccess = () => {
      try {
        const get = r.result.transaction('kv').objectStore('kv').get(key)
        get.onsuccess = () => resolve(get.result ?? null)
        get.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    }
  })
}

const enc = encodeURIComponent
async function matrix(s, path) {
  const res = await fetch(`${s.baseUrl}/_matrix/client/v3${path}`, { headers: { Authorization: `Bearer ${s.accessToken}` } })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

// A quick reaction from the notification itself. Only readable (unencrypted) events offer it: a worker cannot
// encrypt, and a reaction sent in the clear into an encrypted room would be refused or leak that it exists.
async function likeEvent(roomId, eventId) {
  const s = await storedSession()
  if (!s) throw new Error('no session')
  const txn = `tessera-like-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const res = await fetch(`${s.baseUrl}/_matrix/client/v3/rooms/${enc(roomId)}/send/m.reaction/${txn}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key: '👍' } }),
  })
  if (!res.ok) throw new Error(String(res.status))
}

self.addEventListener('message', (e) => {
  // Only this app's own pages may ask the worker to act with the stored session.
  if (e.origin !== self.location.origin) return
  const d = e.data
  if (d?.type === 'like' && typeof d.room_id === 'string' && typeof d.event_id === 'string') e.waitUntil(likeEvent(d.room_id, d.event_id).catch(() => {}))
})

// ---- The notification picture -------------------------------------------------------------------------------------------
// A group room: the room's picture as the main tile with the sender as a small round badge in the corner. A direct chat:
// the sender's picture alone, since room and sender are the same person. Pictures need the access token on current servers
// (a bare icon URL cannot carry it), so the worker fetches them and draws the combination itself; with no picture a
// coloured tile with initials is drawn, in the same palette as the app. Any failure just means the app icon.
const TONES = ['#f08a72', '#efc352', '#52c2b2', '#8f9dff', '#f093b9', '#9fd16f']
const toneOf = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997; return TONES[h % 6] }
const initialsOf = (n) => n.replace(/^[#@!]/, '').trim().slice(0, 2).toUpperCase() || '?'

async function mediaBitmap(s, mxc, size) {
  const m = /^mxc:\/\/([^/]+)\/([^/?#]+)$/.exec(mxc ?? '')
  if (!m) return null
  const q = `${enc(m[1])}/${enc(m[2])}?width=${size}&height=${size}&method=crop`
  for (const path of [`/_matrix/client/v1/media/thumbnail/${q}`, `/_matrix/media/v3/thumbnail/${q}`]) {
    try {
      const res = await fetch(s.baseUrl + path, { headers: { Authorization: `Bearer ${s.accessToken}` } })
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) continue
      const blob = await res.blob()
      if (blob.size > 400_000) return null
      return await createImageBitmap(blob)
    } catch {
      /* try the next endpoint */
    }
  }
  return null
}

/** Draw a picture, or a coloured tile with initials, into a square or a circle. */
function drawTile(g, x, y, size, round, label, bitmap) {
  g.save()
  g.beginPath()
  if (round) g.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  else g.roundRect(x, y, size, size, size * 0.23)
  g.clip()
  if (bitmap) {
    const side = Math.min(bitmap.width, bitmap.height) // centre-crop to a square
    g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, x, y, size, size)
  } else {
    g.fillStyle = toneOf(label)
    g.fillRect(x, y, size, size)
    g.fillStyle = '#12141a'
    g.font = `700 ${Math.round(size * 0.4)}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(initialsOf(label), x + size / 2, y + size / 2 + size * 0.02)
  }
  g.restore()
}

async function composeIcon(room, sender) {
  const S = 192
  const c = new OffscreenCanvas(S, S)
  const g = c.getContext('2d')
  if (!room) {
    drawTile(g, 0, 0, S, false, sender.name, sender.bitmap)
  } else {
    drawTile(g, 0, 0, S, false, room.name, room.bitmap)
    const d = 92
    const x = S - d - 2
    const y = S - d - 2
    g.fillStyle = '#ffffff' // a ring that separates the badge from the picture behind it
    g.beginPath()
    g.arc(x + d / 2, y + d / 2, d / 2 + 7, 0, Math.PI * 2)
    g.fill()
    drawTile(g, x, y, d, true, sender.name, sender.bitmap)
  }
  const blob = await c.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(bin)}`
}

async function describePush(n) {
  const s = n.event_id && n.room_id ? await storedSession() : null
  if (!s) return { title: 'Tessera', body: 'New message' }
  const [event, room, roomAvatar, members] = await Promise.all([
    matrix(s, `/rooms/${enc(n.room_id)}/event/${enc(n.event_id)}`).catch(() => null),
    matrix(s, `/rooms/${enc(n.room_id)}/state/m.room.name`).catch(() => null),
    matrix(s, `/rooms/${enc(n.room_id)}/state/m.room.avatar`).catch(() => null),
    matrix(s, `/rooms/${enc(n.room_id)}/joined_members`).catch(() => null),
  ])
  if (!event) return { title: 'Tessera', body: 'New message' }
  const profile = await matrix(s, `/profile/${enc(event.sender)}`).catch(() => null)
  const who = profile?.displayname || event.sender
  const c = event.content ?? {}
  const body =
    event.type === 'm.room.encrypted' ? 'Encrypted message'
    : c.msgtype === 'm.image' ? 'Sent a photo'
    : c.msgtype === 'm.file' ? 'Sent a file'
    : typeof c.body === 'string' ? c.body.slice(0, 160)
    : 'New message'
  let icon = null
  try {
    // An unnamed room of two people or fewer is a direct chat: the sender's picture alone. Any named room, or a bigger one,
    // gets the room's picture with the sender as a badge.
    const direct = !room?.name && (members ? Object.keys(members.joined ?? {}).length <= 2 : true)
    const sender = { name: who, bitmap: await mediaBitmap(s, profile?.avatar_url, direct ? 192 : 96) }
    const group = direct ? null : { name: room?.name || 'Room', bitmap: await mediaBitmap(s, roomAvatar?.url, 192) }
    icon = await composeIcon(group, sender)
  } catch {
    icon = null // the app icon is used instead
  }
  return { title: room?.name ? `${who} in ${room.name}` : who, body, canLike: event.type === 'm.room.message', icon }
}

// Quiet hours (a copy of inSchedule in src/lib/dnd.ts: keep them in step). A browser requires every push to show a
// notification, so during do-not-disturb the worker cannot hide it; it shows it silently, without sound or vibration.
function inSchedule(s, when) {
  const mins = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN }
  if (!s || !s.enabled || !Array.isArray(s.days) || !s.days.length) return false
  const from = mins(s.from), to = mins(s.to)
  if (Number.isNaN(from) || Number.isNaN(to)) return false
  const now = when.getHours() * 60 + when.getMinutes()
  const today = when.getDay(), yesterday = (today + 6) % 7
  if (from === to) return s.days.includes(today)
  if (from < to) return s.days.includes(today) && now >= from && now < to
  return (s.days.includes(today) && now >= from) || (s.days.includes(yesterday) && now < to)
}
async function quietNow() {
  const d = await stored('dnd')
  if (!d) return false
  const manual = d.manualUntil === null || (typeof d.manualUntil === 'number' && d.manualUntil > Date.now())
  return manual || inSchedule(d.schedule, new Date())
}

self.addEventListener('push', (e) => {
  e.waitUntil(
    (async () => {
      let n = {}
      try {
        n = e.data?.json()?.notification ?? {}
      } catch {
        /* not JSON: show the generic text below */
      }
      // The window the person is looking at already shows the message.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return
      const [{ title, body, canLike, icon }, quiet] = await Promise.all([describePush(n), quietNow()])
      await self.registration.showNotification(title, {
        body,
        icon: icon || '/icon-192.png',
        badge: '/icon-192.png',
        tag: n.room_id || 'tessera',
        renotify: !quiet,
        silent: quiet,
        data: { room_id: n.room_id, event_id: n.event_id },
        actions: canLike ? [{ action: 'like', title: '👍 Like' }] : [],
      })
    })(),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { room_id: room, event_id: event } = e.notification.data ?? {}
  const hash = room ? `#/room/${enc(room)}${event ? '/' + enc(event) : ''}` : ''
  e.waitUntil(
    (async () => {
      if (e.action === 'like' && room && event) {
        try {
          await likeEvent(room, event)
          return // done without opening anything
        } catch {
          /* could not react: open the room so the person can */
        }
      }
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const win = wins.find((w) => w.visibilityState === 'visible') ?? wins[0]
      if (win) {
        // Tell the open window to show the room instead of reloading it.
        win.postMessage({ type: 'open', hash })
        await win.focus()
      } else {
        await self.clients.openWindow('/' + hash)
      }
    })(),
  )
})
