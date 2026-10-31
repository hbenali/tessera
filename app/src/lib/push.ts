/** Web Push helpers. Kept free of the Matrix SDK; the pusher itself is registered by the Chat class. */
import type { Schedule } from './dnd'

export const PUSH_APP_ID = 'ovh.hbenali.tessera.web'

export interface PushConfig {
  /** Push gateway URL the homeserver calls, e.g. https://push.example.org/_matrix/push/v1/notify */
  gateway: string
  /** The gateway's VAPID public key (the "application server key"), base64url. */
  vapidPublicKey: string
}

export interface WebSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export const pushSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** HTTPS, or plain http for loopback and private addresses so a gateway can be tried on a LAN. */
export function validGateway(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return true
    if (u.protocol !== 'http:') return false
    return /^(localhost|127\.|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || u.hostname === 'localhost'
  } catch {
    return false
  }
}

const B64U = /^[A-Za-z0-9_-]{80,100}$/

/** The deployment's push settings from config.json, or null when push is not set up there. */
export async function loadPushConfig(): Promise<PushConfig | null> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (!res.ok) return null
    const push = ((await res.json()) as { push?: Partial<PushConfig> }).push
    return push?.gateway && push.vapidPublicKey && validGateway(push.gateway) && B64U.test(push.vapidPublicKey) ? (push as PushConfig) : null
  } catch {
    return null
  }
}

export const toBase64Url = (buf: ArrayBuffer | null): string =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function describe(sub: PushSubscription): WebSubscription {
  return { endpoint: sub.endpoint, p256dh: toBase64Url(sub.getKey('p256dh')), auth: toBase64Url(sub.getKey('auth')) }
}

export async function currentSubscription(): Promise<WebSubscription | null> {
  const reg = await swReady()
  const sub = await reg.pushManager.getSubscription()
  return sub ? describe(sub) : null
}

/** Subscribe this browser to the gateway's VAPID key; the browser shows its own prompt if permission is not yet given. */
export async function subscribe(cfg: PushConfig): Promise<WebSubscription> {
  const reg = await swReady()
  let sub = await reg.pushManager.getSubscription()
  // A subscription made for another VAPID key cannot be reused.
  if (sub && toBase64Url(sub.options.applicationServerKey) !== cfg.vapidPublicKey) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(cfg.vapidPublicKey) })
  return describe(sub)
}

export async function unsubscribe(): Promise<void> {
  const reg = await swReady()
  await (await reg.pushManager.getSubscription())?.unsubscribe()
}

// The service worker cannot read localStorage, so a push can be turned into readable text only if it is given the
// session. That is stored in IndexedDB only while background notifications are on, and removed when they are turned off.
const DB = 'tessera-push'
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export interface PushSession {
  baseUrl: string
  accessToken: string
  userId: string
}

async function kvSet(key: string, value: unknown | null): Promise<void> {
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction('kv', 'readwrite')
    if (value) tx.objectStore('kv').put(value, key)
    else tx.objectStore('kv').delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  d.close()
}

export const storePushSession = (s: PushSession | null) => kvSet('session', s)

/** What the worker needs to keep a push quiet: a manual do-not-disturb end time and the recurring schedule. */
export interface WorkerDnd {
  manualUntil: number | null | undefined // undefined: manual do-not-disturb is off; null: until turned off
  schedule: Schedule
}
export const storeWorkerDnd = (d: WorkerDnd | null) => kvSet('dnd', d)


/** Give up on a promise that may never settle (a blocked or failed service worker never becomes ready). */
export function within<T>(p: Promise<T>, ms: number, what = 'That'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms) })
  return Promise.race([p, late]).finally(() => clearTimeout(timer))
}

/** The service worker registration, or an error after a few seconds instead of waiting for ever. */
export const swReady = (ms = 3000): Promise<ServiceWorkerRegistration> => within(navigator.serviceWorker.ready, ms, 'The service worker')
