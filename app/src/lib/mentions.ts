/** True if a message addresses `userId`: structured m.mentions first, then a plain-text fallback. */
export function mentionsUser(content: Record<string, any>, userId: string, displayName?: string): boolean {
  const m = content['m.mentions']
  if (m) return !!m.room || (m.user_ids ?? []).includes(userId)
  const body = String(content.body ?? '')
  if (body.includes(userId)) return true
  if (!displayName || displayName.length < 3) return false
  const esc = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\W)@?${esc}(\\W|$)`, 'i').test(body)
}

/** A Matrix user id written in text, at a word boundary (group 1 = lead-in, group 2 = the id). */
export const MENTION_ID = /(^|[\s(])(@[a-z0-9._=\-/+]+:[a-z0-9.\-]+(?::\d+)?)/gi

/** Plain-text form for previews and notifications: ids become "@Display name". */
export function plainMentions(body: string, name: (id: string) => string | undefined): string {
  return body.replace(MENTION_ID, (_, pre: string, id: string) => `${pre}@${name(id) ?? id.slice(1)}`)
}
