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
