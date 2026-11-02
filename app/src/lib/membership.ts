// Membership and profile events (joins, leaves, name and avatar changes): kept out of a room's activity, and shown in the timeline only when asked.
export interface MemberEvent {
  sender: string
  stateKey: string
  content: Record<string, unknown>
  prev?: Record<string, unknown>
}

/** One line for a membership or profile event, or null when nothing visible changed (e.g. only the reason or a re-sent join). */
export function memberNotice(e: MemberEvent, nameOf: (id: string) => string): string | null {
  const now = typeof e.content.membership === 'string' ? e.content.membership : ''
  const was = typeof e.prev?.membership === 'string' ? e.prev.membership : ''
  const name = (c: Record<string, unknown> | undefined) => (typeof c?.displayname === 'string' && c.displayname ? c.displayname : '')
  const who = name(e.content) || nameOf(e.stateKey)
  if (now === 'join' && was === 'join') {
    if (name(e.content) !== name(e.prev)) return name(e.content) ? `${name(e.prev) || e.stateKey} changed their name to ${name(e.content)}` : `${name(e.prev) || e.stateKey} removed their name`
    if ((e.content.avatar_url ?? '') !== (e.prev?.avatar_url ?? '')) return `${who} changed their avatar`
    return null
  }
  if (now === 'join') return `${who} joined`
  if (now === 'invite') return `${nameOf(e.stateKey)} was invited`
  if (now === 'ban') return `${nameOf(e.stateKey)} was banned`
  if (now === 'leave') {
    if (was === 'ban') return `${nameOf(e.stateKey)} was unbanned`
    if (was === 'invite' && e.sender !== e.stateKey) return `${nameOf(e.stateKey)}'s invitation was withdrawn`
    return e.sender === e.stateKey ? `${who} left` : `${nameOf(e.stateKey)} was removed`
  }
  return null
}

/**
 * When a room last had something happen, for ordering the list. Membership events are left out: someone changing
 * their name or joining must not push the room up. An invitation has nothing else, so it counts there.
 */
export function activityTs(events: { type: string; ts: number }[], invited = false): number {
  let other = 0
  let member = 0
  for (const e of events) {
    if (e.type === 'm.room.member') member = Math.max(member, e.ts)
    else other = Math.max(other, e.ts)
  }
  return other || (invited ? member : 0)
}
