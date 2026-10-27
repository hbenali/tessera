import { beforeEach, describe, expect, it } from 'vitest'
import { getDraft, setDraft } from './drafts'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
})

describe('drafts', () => {
  it('keeps text per room and forgets it when emptied', () => {
    setDraft('!a', 'hello')
    setDraft('!b', 'world')
    expect(getDraft('!a')).toBe('hello')
    expect(getDraft('!b')).toBe('world')
    setDraft('!a', '   ')
    expect(getDraft('!a')).toBe('')
    expect(getDraft('!b')).toBe('world')
  })
  it('survives corrupt or unavailable storage', () => {
    store.set('tessera.drafts', '{nope')
    expect(getDraft('!a')).toBe('')
    ;(globalThis as { localStorage?: unknown }).localStorage = undefined
    expect(() => setDraft('!a', 'x')).not.toThrow()
    expect(getDraft('!a')).toBe('')
  })
})
