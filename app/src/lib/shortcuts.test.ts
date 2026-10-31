import { describe, expect, it } from 'vitest'
import { readShortcut, withoutShortcut } from './shortcuts'

describe('shortcuts', () => {
  it('reads known actions and views', () => {
    expect(readShortcut('?action=search')).toEqual({ action: 'search', view: undefined })
    expect(readShortcut('?view=unread')).toEqual({ action: undefined, view: 'unread' })
    expect(readShortcut('?action=new&view=people')).toEqual({ action: 'new', view: 'people' })
  })
  it('ignores anything unknown, so a crafted link cannot do more than open a screen', () => {
    expect(readShortcut('?action=logout&view=../x')).toEqual({ action: undefined, view: undefined })
    expect(readShortcut('')).toEqual({ action: undefined, view: undefined })
  })
  it('cleans the address and keeps the rest', () => {
    expect(withoutShortcut('https://t.example/?action=new&keep=1#/room/!a')).toBe('/?keep=1#/room/!a')
  })
})
