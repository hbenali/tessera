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
function storedSession() {
  return new Promise((resolve) => {
    const r = indexedDB.open('tessera-push', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onerror = () => resolve(null)
    r.onsuccess = () => {
      try {
        const get = r.result.transaction('kv').objectStore('kv').get('session')
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

// The sender's avatar as a small data: URL, so the notification shows who wrote. Media needs the access token on
// current servers (so a bare icon URL cannot work); older servers serve it without. Any failure just means the app icon.
async function avatarIcon(s, mxc) {
  const m = /^mxc:\/\/([^/]+)\/([^/?#]+)$/.exec(mxc ?? '')
  if (!m) return null
  const q = `${enc(m[1])}/${enc(m[2])}?width=96&height=96&method=crop`
  for (const path of [`/_matrix/client/v1/media/thumbnail/${q}`, `/_matrix/media/v3/thumbnail/${q}`]) {
    try {
      const res = await fetch(s.baseUrl + path, { headers: { Authorization: `Bearer ${s.accessToken}` } })
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('image/')) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length > 200_000) return null
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return `data:${type};base64,${btoa(bin)}`
    } catch {
      /* try the next endpoint */
    }
  }
  return null
}

async function describePush(n) {
  const s = n.event_id && n.room_id ? await storedSession() : null
  if (!s) return { title: 'Tessera', body: 'New message' }
  const [event, room] = await Promise.all([
    matrix(s, `/rooms/${enc(n.room_id)}/event/${enc(n.event_id)}`).catch(() => null),
    matrix(s, `/rooms/${enc(n.room_id)}/state/m.room.name`).catch(() => null),
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
  const icon = await avatarIcon(s, profile?.avatar_url)
  return { title: room?.name ? `${who} in ${room.name}` : who, body, canLike: event.type === 'm.room.message', icon }
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
      const { title, body, canLike, icon } = await describePush(n)
      await self.registration.showNotification(title, {
        body,
        icon: icon || '/icon-192.png',
        badge: '/icon-192.png',
        tag: n.room_id || 'tessera',
        renotify: true,
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
