/** Small shared UI helpers and state. */
/** Deterministic ink colour per sender, so names are scannable without avatars. */
const hue = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
export const ink = (n: string) => `color:hsl(${hue(n)} 45% var(--ink-l))`

class Ui {
  modal = $state<null | 'settings' | 'new-room' | 'join-room'>(null)
  theme = $state<'auto' | 'light' | 'dark'>((localStorage.getItem('tessera.theme') as 'auto') ?? 'auto')
  setTheme(t: 'auto' | 'light' | 'dark') {
    this.theme = t
    localStorage.setItem('tessera.theme', t)
    if (t === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = t
  }
}
export const ui = new Ui()
ui.setTheme(ui.theme)
