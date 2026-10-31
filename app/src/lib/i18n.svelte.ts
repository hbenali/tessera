// Translations. The English text is the key, so a string with no translation simply shows in English.
import { fr } from './locales/fr'
import { es } from './locales/es'
import { de } from './locales/de'

export const LANGUAGES = [
  { id: 'en', name: 'English', table: {} as Record<string, string> },
  { id: 'fr', name: 'Français', table: fr },
  { id: 'es', name: 'Español', table: es },
  { id: 'de', name: 'Deutsch', table: de },
] as const
export type LangId = (typeof LANGUAGES)[number]['id']
const KEY = 'tessera.lang'

/** The saved language, else the browser's, else English. */
export function pickLanguage(saved: string | null | undefined, browser: readonly string[]): LangId {
  const ids = LANGUAGES.map((l) => l.id as string)
  if (saved && ids.includes(saved)) return saved as LangId
  for (const b of browser) {
    const base = b.toLowerCase().split('-')[0]
    if (ids.includes(base)) return base as LangId
  }
  return 'en'
}

/** Fill {name} style holes. */
export const fill = (s: string, vars?: Record<string, string | number>): string => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s)

class I18n {
  lang = $state<LangId>(
    pickLanguage(
      (() => { try { return localStorage.getItem(KEY) } catch { return null } })(),
      typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]),
    ),
  )
  set(l: LangId) {
    this.lang = l
    try { localStorage.setItem(KEY, l) } catch { /* private mode */ }
    if (typeof document !== 'undefined') document.documentElement.lang = l
  }
}
export const i18n = new I18n()
if (typeof document !== 'undefined') document.documentElement.lang = i18n.lang

/** Translate an English string (reactive: it follows the chosen language). */
export function t(en: string, vars?: Record<string, string | number>): string {
  const table = LANGUAGES.find((l) => l.id === i18n.lang)?.table
  return fill(table?.[en] ?? en, vars)
}
