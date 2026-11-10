// The one-tap replies shown as buttons on a push notification ("OK", "Thanks"...). Kept in the account's data, so they follow you
// between devices, and copied to the background worker, which sends one as a reply to the message. SDK-free.
export const MAX_QUICK = 3
export const MAX_QUICK_LENGTH = 40
export const DEFAULT_QUICK: readonly string[] = ['OK', 'Thanks', 'On my way']

/** One line, trimmed, at most 40 characters, no empties or repeats (ignoring case), at most 3. */
export function cleanQuickReplies(list: readonly unknown[]): string[] {
  const out: string[] = []
  for (const v of list) {
    if (typeof v !== 'string') continue
    const t = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUICK_LENGTH).trim()
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t)
    if (out.length >= MAX_QUICK) break
  }
  return out
}

/** From the account data: nothing set yet gives the defaults, a saved list (even an empty one, which turns them off) is kept as it is. */
export function parseQuickReplies(content: unknown): string[] {
  const r = (content as { replies?: unknown } | null | undefined)?.replies
  return Array.isArray(r) ? cleanQuickReplies(r) : [...DEFAULT_QUICK]
}
