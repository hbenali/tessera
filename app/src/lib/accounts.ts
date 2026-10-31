// The accounts saved in this browser. One is active at a time; switching reloads the app on another account.
// SDK-free, so the sign-in page can use it.
export interface Account {
  baseUrl: string
  accessToken: string
  userId: string
  deviceId: string
  name?: string
  avatar?: string
}

export const ACCOUNTS_KEY = 'tessera.accounts'
export const SESSION_KEY = 'tessera.session'

const valid = (a: unknown): a is Account => {
  const x = a as Account
  return !!x && typeof x.baseUrl === 'string' && typeof x.accessToken === 'string' && typeof x.userId === 'string' && typeof x.deviceId === 'string'
}

export function readAccounts(storage: Pick<Storage, 'getItem'> = localStorage): Account[] {
  try {
    const v = JSON.parse(storage.getItem(ACCOUNTS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter(valid) : []
  } catch {
    return []
  }
}

/** Add an account, or refresh the saved one for the same user (keeping its name and picture if the new one has none). */
export function upsert(list: Account[], a: Account): Account[] {
  const old = list.find((x) => x.userId === a.userId)
  const merged = { ...a, name: a.name ?? old?.name, avatar: a.avatar ?? old?.avatar }
  return old ? list.map((x) => (x.userId === a.userId ? merged : x)) : [...list, merged]
}

export const remove = (list: Account[], userId: string): Account[] => list.filter((x) => x.userId !== userId)

/** Who to switch to when the active account goes away: the next one in the list, wrapping round. */
export function after(list: Account[], userId: string): Account | undefined {
  const rest = remove(list, userId)
  if (!rest.length) return undefined
  const i = list.findIndex((x) => x.userId === userId)
  return rest[Math.min(Math.max(i, 0), rest.length - 1)]
}

export function save(list: Account[], storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(ACCOUNTS_KEY, JSON.stringify(list)) } catch { /* storage may be blocked */ }
}

/** "@ann:example.org" on "example.org" reads better as "ann" ; used when an account has no display name yet. */
export const shortId = (userId: string): string => userId.replace(/^@/, '').split(':')[0]
