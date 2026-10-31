import { describe, expect, it } from 'vitest'
import { ACCOUNTS_KEY, after, readAccounts, remove, shortId, upsert, type Account } from './accounts'

const a = (id: string, extra: Partial<Account> = {}): Account => ({ baseUrl: 'https://h', accessToken: 't' + id, userId: `@${id}:h`, deviceId: 'D' + id, ...extra })

describe('accounts', () => {
  it('adds a new account and refreshes a known one without losing its name', () => {
    const one = upsert([], a('ann', { name: 'Ann' }))
    const two = upsert(one, a('bob'))
    const again = upsert(two, { ...a('ann'), accessToken: 'new' })
    expect(again.map((x) => x.userId)).toEqual(['@ann:h', '@bob:h'])
    expect(again[0]).toMatchObject({ accessToken: 'new', name: 'Ann' })
  })
  it('removes one', () => expect(remove([a('ann'), a('bob')], '@ann:h').map((x) => x.userId)).toEqual(['@bob:h']))
  it('picks who is next when the active account goes', () => {
    const l = [a('ann'), a('bob'), a('cy')]
    expect(after(l, '@ann:h')?.userId).toBe('@bob:h')
    expect(after(l, '@bob:h')?.userId).toBe('@cy:h')
    expect(after(l, '@cy:h')?.userId).toBe('@bob:h')
    expect(after([a('ann')], '@ann:h')).toBeUndefined()
  })
  it('ignores damaged saved data', () => {
    const store = (v: string) => ({ getItem: (k: string) => (k === ACCOUNTS_KEY ? v : null) })
    expect(readAccounts(store('not json'))).toEqual([])
    expect(readAccounts(store('{"a":1}'))).toEqual([])
    expect(readAccounts(store(JSON.stringify([a('ann'), { userId: 1 }, null])))).toHaveLength(1)
  })
  it('shortens an id', () => expect(shortId('@ann:example.org')).toBe('ann'))
})
