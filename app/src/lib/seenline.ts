import type { Msg } from './matrix.svelte'

export type SeenLine = { state: 'sending' | 'sent' | 'seen' | 'failed'; text: string }

/**
 * The status line shown by the composer: how my latest message is doing. "Seen by Ann" (with the time in a DM),
 * "Seen by Ann, Bo and 2 others" in a group, or Sending / Sent / Not sent. Null when my last message is not the
 * latest thing to report (someone else spoke since, or nothing of mine is loaded).
 */
export function seenLine(messages: Pick<Msg, 'id' | 'mine' | 'state' | 'seenBy'>[], dm: boolean, fmt: (ts: number) => string): SeenLine | null {
  const last = messages.findLast((m) => m.mine)
  if (!last || !last.state) return null
  if (messages.slice(messages.indexOf(last) + 1).some((m) => !m.mine)) return null // they replied: that says it all
  if (last.state === 'seen') {
    // Readers sit on the message where they stopped, which may be mine or a later one.
    const from = messages.indexOf(last)
    const who = new Map<string, { name: string; ts?: number }>()
    for (const m of messages.slice(from)) for (const r of m.seenBy ?? []) if (!who.has(r.id)) who.set(r.id, r)
    const list = [...who.values()].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    if (!list.length) return { state: 'seen', text: 'Seen' }
    const names = list.slice(0, 2).map((r) => r.name)
    const more = list.length - names.length
    const text = more > 0 ? `${names.join(', ')} and ${more} other${more > 1 ? 's' : ''}` : names.join(' and ')
    return { state: 'seen', text: dm && list[0].ts ? `Seen by ${text} · ${fmt(list[0].ts)}` : `Seen by ${text}` }
  }
  return { state: last.state, text: { sending: 'Sending…', sent: 'Sent', failed: 'Not sent' }[last.state] }
}
