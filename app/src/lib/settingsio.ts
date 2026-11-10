// Reads this browser's settings for export, and applies imported ones through the app's own setters so the page updates at once.
import { chat } from './matrix.svelte'
import { i18n } from './i18n.svelte'
import { setSoundOn, setSoundStyle, soundOn, soundStyle } from './sound'
import { ui } from './ui.svelte'
import type { Settings } from './settingsfile'

const ADV = 'tessera.searchAdvanced'

export function currentSettings(): Settings {
  let searchAdvanced = false
  try { searchAdvanced = localStorage.getItem(ADV) === '1' } catch { /* blocked storage: the default */ }
  return {
    theme: ui.theme,
    layout: ui.layout,
    density: ui.density,
    textSize: ui.textSize,
    showMembership: ui.showMembership,
    language: i18n.lang,
    roomOrder: chat.roomOrder,
    list: { ...ui.list },
    listHidden: ui.listHidden,
    sound: soundOn(),
    soundStyle: soundStyle(),
    searchAdvanced,
  }
}

/** Apply only the settings that are present (they were checked by sanitize before they got here). */
export function applySettings(s: Settings) {
  if (s.theme !== undefined) ui.setTheme(s.theme)
  if (s.layout !== undefined) ui.setLayout(s.layout)
  if (s.density !== undefined || s.textSize !== undefined) ui.setLook({ density: s.density, textSize: s.textSize })
  if (s.showMembership !== undefined) { ui.setShowMembership(s.showMembership); chat.refreshMessages() }
  if (s.language !== undefined) i18n.set(s.language)
  if (s.roomOrder !== undefined) chat.setRoomOrder(s.roomOrder)
  if (s.list !== undefined) ui.setList(s.list)
  if (s.listHidden !== undefined) ui.setListHidden(s.listHidden)
  if (s.sound !== undefined) setSoundOn(s.sound)
  if (s.soundStyle !== undefined) setSoundStyle(s.soundStyle)
  if (s.searchAdvanced !== undefined) { try { localStorage.setItem(ADV, s.searchAdvanced ? '1' : '0') } catch { /* not remembered */ } }
}
