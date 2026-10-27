import { beforeEach, describe, expect, it } from 'vitest'
import { clearDrafts, getDraft, setDraft } from './drafts'

const store = new Map<string, string>()
beforeEach(() => {
  clearDrafts()
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
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
    expect(getDraft('!a')).toBe('x') // still kept in memory for this session
  })
  it('never writes drafts of encrypted rooms to storage, but still remembers them in memory', () => {
    setDraft('!enc', 'secret plans', false)
    expect(getDraft('!enc')).toBe('secret plans')
    expect(store.get('tessera.drafts') ?? '').not.toContain('secret plans')
  })
  it('removes an older stored copy when a room turns out to be encrypted, and on sign-out', () => {
    setDraft('!r', 'plain', true)
    expect(store.get('tessera.drafts')).toContain('plain')
    setDraft('!r', 'now private', false)
    expect(store.get('tessera.drafts') ?? '').not.toContain('plain')
    clearDrafts()
    expect(getDraft('!r')).toBe('')
    expect(store.has('tessera.drafts')).toBe(false)
  })
})
