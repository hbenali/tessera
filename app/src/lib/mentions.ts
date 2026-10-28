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

// ---- Mentions in the message box ----------------------------------------------------------------------------------
// The box shows a person as "@Name" while the message that is sent carries their Matrix id. `picked` remembers which
// name is which id, so the two forms convert both ways.

export type Picked = Record<string, string> // display name -> Matrix id

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A matcher for "@Name" for the picked names: longest first, at a word start, not followed by more name characters. */
function matcher(picked: Picked): RegExp | null {
  const names = Object.keys(picked).sort((a, b) => b.length - a.length)
  return names.length ? new RegExp(`(?<=^|[\\s(])@(${names.map(escapeRe).join('|')})(?![\\p{L}\\p{N}_])`, 'gu') : null
}

/** The ranges of text that are mentions, for drawing them as pills. */
export function mentionRanges(text: string, picked: Picked): [number, number][] {
  const re = matcher(picked)
  return re ? [...text.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length] as [number, number]) : []
}

/** The text with each picked "@Name" replaced by the person's Matrix id: what is actually sent. */
export function fromComposer(text: string, picked: Picked): string {
  const re = matcher(picked)
  return re ? text.replace(re, (_, name: string) => picked[name]) : text
}

/** A message body shown in the box (an edit, a restored draft): ids become "@Name" where the name is known and unambiguous. */
export function toComposer(body: string, name: (id: string) => string | undefined): { text: string; picked: Picked } {
  const picked: Picked = {}
  const text = body.replace(MENTION_ID, (whole, pre: string, id: string) => {
    const n = name(id)
    if (!n || (picked[n] && picked[n] !== id)) return whole // unknown, or two people share a name: leave the id
    picked[n] = id
    return `${pre}@${n}`
  })
  return { text, picked }
}
