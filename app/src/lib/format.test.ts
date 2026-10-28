import { describe, expect, it } from 'vitest'
import { quote, wrap } from './format'

describe('wrap', () => {
  it('puts markers around the selection and keeps it selected', () => {
    expect(wrap('say hello now', 4, 9, '**')).toEqual({ text: 'say **hello** now', start: 6, end: 11 })
  })
  it('puts the caret between markers when nothing is selected', () => {
    expect(wrap('ab', 1, 1, '*')).toEqual({ text: 'a**b', start: 2, end: 2 })
  })
  it('takes markers off again, whether they are outside or inside the selection', () => {
    expect(wrap('say **hello** now', 6, 11, '**')).toEqual({ text: 'say hello now', start: 4, end: 9 })
    expect(wrap('say **hello** now', 4, 13, '**')).toEqual({ text: 'say hello now', start: 4, end: 9 })
  })
  it('works with a single backtick', () => {
    expect(wrap('run ls', 4, 6, '`').text).toBe('run `ls`')
  })
})

describe('quote', () => {
  it('quotes the touched lines and unquotes them again', () => {
    const q = quote('one\ntwo\nthree', 4, 7)
    expect(q.text).toBe('one\n> two\nthree')
    expect(quote(q.text, q.start, q.end).text).toBe('one\ntwo\nthree')
  })
  it('quotes a single line with the caret anywhere in it', () => {
    expect(quote('hello', 2, 2).text).toBe('> hello')
  })
  it('quotes every line of a multi-line selection', () => {
    expect(quote('a\nb\nc', 0, 5).text).toBe('> a\n> b\n> c')
  })
})
