import { expect, it } from 'vitest'
import { pageTitle } from './pagetitle'

it('names the app once, even in a room called Tessera', () => {
  expect(pageTitle(0)).toBe('Tessera')
  expect(pageTitle(3, 'Friends')).toBe('(3) Friends · Tessera')
  expect(pageTitle(0, 'Tessera')).toBe('Tessera')
  expect(pageTitle(2, 'tessera')).toBe('(2) Tessera')
})

it('leaves the app name to the window of an installed app', () => {
  expect(pageTitle(0, 'Friends', true)).toBe('Friends')
  expect(pageTitle(3, 'Friends', true)).toBe('(3) Friends')
  expect(pageTitle(3, undefined, true)).toBe('(3)')
  expect(pageTitle(0, undefined, true)).toBe('Tessera')
})
