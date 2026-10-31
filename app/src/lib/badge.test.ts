import { describe, expect, it, vi } from 'vitest'
import { applyBadge, badgeCount } from './badge'

const r = (o: Partial<{ unread: number; isSpace: boolean; invited: boolean; notifs: string; markedUnread: boolean }> = {}) => ({ unread: 0, isSpace: false, invited: false, notifs: 'all', markedUnread: false, ...o })

describe('badgeCount', () => {
  it('adds unread messages, skipping muted rooms and spaces', () => {
    expect(badgeCount([r({ unread: 3 }), r({ unread: 9, notifs: 'mute' }), r({ unread: 5, isSpace: true }), r({ unread: 2, notifs: 'mentions' })])).toBe(5)
  })
  it('counts an invitation and a hand-flagged room as one each', () => {
    expect(badgeCount([r({ invited: true }), r({ markedUnread: true }), r({ markedUnread: true, unread: 4 })])).toBe(1 + 1 + 4)
  })
  it('is zero for nothing unread', () => expect(badgeCount([])).toBe(0))
})

describe('applyBadge', () => {
  it('sets the count, or clears it at zero', async () => {
    const nav = { setAppBadge: vi.fn().mockResolvedValue(undefined), clearAppBadge: vi.fn().mockResolvedValue(undefined) }
    expect(await applyBadge(7, nav)).toBe(true)
    expect(nav.setAppBadge).toHaveBeenCalledWith(7)
    expect(await applyBadge(0, nav)).toBe(true)
    expect(nav.clearAppBadge).toHaveBeenCalled()
  })
  it('does nothing, quietly, where the API is missing or refuses', async () => {
    expect(await applyBadge(3, {})).toBe(false)
    expect(await applyBadge(3, { setAppBadge: () => Promise.reject(new Error('no')) })).toBe(false)
  })
})
