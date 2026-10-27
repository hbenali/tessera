/** Small shared UI helpers and state. */
/** Deterministic flat colour (0-5) per name: rooms and senders keep one tile colour. */
export const tone = (s: string) => {
  let h = 7
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997
  return h % 6
}
export const tileBg = (n: string) => `background:var(--t${tone(n)})`

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
