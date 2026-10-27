import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { chat } from './lib/matrix.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app

// Offline shell for the installed app; skipped in dev so HMR is never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Handy for debugging in the browser console; stripped from production builds.
if (import.meta.env.DEV) (window as unknown as { __chat: typeof chat }).__chat = chat
