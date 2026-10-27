/** Small shared UI helpers and state. */
export const hue = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
export const initials = (n: string) => n.replace(/^[#@!]/, '').slice(0, 2).toUpperCase()
export const tile = (n: string) => `background:linear-gradient(135deg,hsl(${hue(n)} 70% 58%),hsl(${(hue(n) + 40) % 360} 70% 48%))`

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
