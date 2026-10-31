// What the installed app's icon badge shows. SDK-free.
interface Counted { unread: number; isSpace: boolean; invited: boolean; notifs: string; markedUnread: boolean }

/**
 * Messages waiting in rooms that notify me, plus invitations and rooms I flagged unread by hand. A muted room never counts:
 * its own unread number is still shown in the list, but it should not pull me back to the app.
 */
export function badgeCount(rooms: readonly Counted[]): number {
  let n = 0
  for (const r of rooms) {
    if (r.isSpace) continue
    if (r.invited) n += 1
    else if (r.notifs !== 'mute') n += r.unread > 0 ? r.unread : r.markedUnread ? 1 : 0
  }
  return n
}

type Badging = { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** Set or clear the badge where the browser supports it; never throws (it is a nicety, not a feature to fail on). */
export async function applyBadge(n: number, nav: Badging = navigator as unknown as Badging): Promise<boolean> {
  try {
    if (n > 0 && nav.setAppBadge) { await nav.setAppBadge(Math.min(n, 99_999)); return true }
    if (n <= 0 && nav.clearAppBadge) { await nav.clearAppBadge(); return true }
  } catch { /* the page is not an installed app, or the permission was refused */ }
  return false
}
