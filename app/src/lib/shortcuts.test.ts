import { describe, expect, it } from 'vitest'
import { readShortcut, withoutShortcut } from './shortcuts'

describe('shortcuts', () => {
  it('reads known actions and views', () => {
    expect(readShortcut('?action=search')).toMatchObject({ action: 'search', view: undefined })
    expect(readShortcut('?view=unread')).toMatchObject({ action: undefined, view: 'unread' })
    expect(readShortcut('?action=new&view=people')).toMatchObject({ action: 'new', view: 'people' })
  })
  it('ignores anything unknown, so a crafted link cannot do more than open a screen', () => {
    expect(readShortcut('?action=logout&view=../x')).toMatchObject({ action: undefined, view: undefined })
    expect(readShortcut('')).toMatchObject({ action: undefined, view: undefined, matrix: undefined })
    expect(readShortcut('?matrix=matrix%3Ar%2Fa%3Ab.org').matrix).toBe('matrix:r/a:b.org')
  })
  it('cleans the address and keeps the rest', () => {
    expect(withoutShortcut('https://t.example/?action=new&keep=1#/room/!a')).toBe('/?keep=1#/room/!a')
  })
})
