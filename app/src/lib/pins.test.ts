import { describe, expect, it } from 'vitest'
import { toggled } from './pins'

describe('toggled', () => {
  it('adds a new pin at the end and removes an existing one', () => {
    expect(toggled(['$a'], '$b')).toEqual(['$a', '$b'])
    expect(toggled(['$a', '$b'], '$a')).toEqual(['$b'])
    expect(toggled([], '$a')).toEqual(['$a'])
  })
  it('never mutates its input', () => {
    const l = ['$a']
    toggled(l, '$b')
    expect(l).toEqual(['$a'])
  })
})
