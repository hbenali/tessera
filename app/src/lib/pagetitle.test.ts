import { expect, it } from 'vitest'
import { pageTitle } from './pagetitle'

it('names the app once, even in a room called Tessera', () => {
  expect(pageTitle(0)).toBe('Tessera')
  expect(pageTitle(3, 'Friends')).toBe('(3) Friends · Tessera')
  expect(pageTitle(0, 'Tessera')).toBe('Tessera')
  expect(pageTitle(2, 'tessera')).toBe('(2) Tessera')
})
