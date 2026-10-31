import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { install } from './lib/install.svelte'
import { SHARE_KEY, readShare, withoutShare } from './lib/share'
import { readShortcut, withoutShortcut } from './lib/shortcuts'
import { ui } from './lib/ui.svelte'

install.listen()

// Opened from another app's share sheet: keep the text (it survives signing in) and clean the address.
{
  const shared = readShare(location.search)
  if (shared) {
    try { sessionStorage.setItem(SHARE_KEY, shared) } catch { /* private mode: it is kept in memory below */ }
    history.replaceState(null, '', withoutShare(location.href))
  }
  try { ui.shared = shared ?? sessionStorage.getItem(SHARE_KEY) } catch { ui.shared = shared ?? null }
  // Opened from an app shortcut (long-press the icon) or a link that names a screen.
  const sc = readShortcut(location.search)
  if (sc.action || sc.view) { ui.pending = sc; history.replaceState(null, '', withoutShortcut(location.href)) }
}

// Already open when a shortcut or share is used: the installed app is focused instead of reloaded, and told what to show.
type LaunchQueue = { setConsumer(f: (p: { targetURL?: string }) => void): void }
;(window as unknown as { launchQueue?: LaunchQueue }).launchQueue?.setConsumer(({ targetURL }) => {
  if (!targetURL) return
  const q = new URL(targetURL).search
  const sc = readShortcut(q)
  if (sc.action || sc.view) ui.pending = sc
  const text = readShare(q)
  if (text) { try { sessionStorage.setItem(SHARE_KEY, text) } catch { /* kept in memory */ } ui.shared = text }
})

const app = mount(App, {
  target: document.getElementById('app')!,
})

// The page is now Tessera's own: take the static first-paint splash down.
document.getElementById('splash')?.remove()

export default app

// Offline shell for the installed app; skipped in dev so HMR is never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Handy for debugging in the browser console; stripped from production builds.
if (import.meta.env.DEV) {
  import('./lib/matrix.svelte').then(({ chat }) => ((window as unknown as { __chat: typeof chat }).__chat = chat))
}
