import { describe, expect, it } from 'vitest'
import { de } from './locales/de'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { fill, pickLanguage } from './i18n.svelte'

const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()

describe('catalogs', () => {
  for (const [name, table] of [['fr', fr], ['es', es], ['de', de]] as const) {
    it(`${name}: no empty text, and the same {holes} as English`, () => {
      for (const [en, tr] of Object.entries(table)) {
        expect(tr.trim(), en).not.toBe('')
        expect(holes(tr), en).toBe(holes(en))
      }
    })
  }
  it('all languages translate the same strings, so none is left behind', () => {
    const keys = (t: Record<string, string>) => Object.keys(t).sort().join('|')
    expect(keys(es)).toBe(keys(fr))
    expect(keys(de)).toBe(keys(fr))
  })
})

describe('pickLanguage', () => {
  it('prefers the saved choice, then the browser, then English', () => {
    expect(pickLanguage('de', ['fr-FR'])).toBe('de')
    expect(pickLanguage(null, ['pt-BR', 'fr-CA'])).toBe('fr')
    expect(pickLanguage('xx', ['ja'])).toBe('en')
    expect(pickLanguage(undefined, [])).toBe('en')
  })
})

describe('fill', () => {
  it('replaces holes and leaves unknown ones', () => { expect(fill('Hi {name}, {x}', { name: 'Ann' })).toBe('Hi Ann, {x}'); expect(fill('plain')).toBe('plain') })
})
