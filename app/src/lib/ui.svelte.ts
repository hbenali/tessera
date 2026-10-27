/** Small shared UI helpers and state. */
/** Deterministic flat colour (0-5) per name: rooms and senders keep one tile colour. */
export const tone = (s: string) => {
  let h = 7
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997
  return h % 6
}
export const tileBg = (n: string) => `background:var(--t${tone(n)})`

export const THEMES = [
  { id: 'auto', label: 'System', bg: '#0d0f14', fg: '#f3f4f8', ac: '#ffd23f' },
  { id: 'dark', label: 'Dark', bg: '#0d0f14', fg: '#f3f4f8', ac: '#ffd23f' },
  { id: 'light', label: 'Light', bg: '#f1f2f5', fg: '#10131a', ac: '#ffd23f' },
  { id: 'midnight', label: 'Midnight', bg: '#000000', fg: '#f5f5f5', ac: '#ffd23f' },
  { id: 'sand', label: 'Sand', bg: '#ece4d3', fg: '#2b2417', ac: '#2b2417' },
  { id: 'forest', label: 'Forest', bg: '#0b130f', fg: '#e8f1ea', ac: '#9be564' },
  { id: 'ocean', label: 'Ocean', bg: '#070f1c', fg: '#e6f0ff', ac: '#4fd1ff' },
  { id: 'contrast', label: 'High contrast', bg: '#000000', fg: '#ffffff', ac: '#ffeb00' },
] as const
export type ThemeId = (typeof THEMES)[number]['id']

function readTheme(): ThemeId {
  try {
    const t = localStorage.getItem('tessera.theme')
    return THEMES.some((x) => x.id === t) ? (t as ThemeId) : 'auto'
  } catch {
    return 'auto'
  }
}

class Ui {
  modal = $state<null | 'settings' | 'new-room' | 'join-room'>(null)
  theme = $state<ThemeId>(readTheme())
  setTheme(t: ThemeId) {
    this.theme = t
    localStorage.setItem('tessera.theme', t)
    if (t === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = t
  }
}
export const ui = new Ui()
ui.setTheme(ui.theme)
