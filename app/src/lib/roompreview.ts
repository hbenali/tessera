// What the room list shows for a room's latest message, and how rooms are ordered.
export type PreviewKind = 'text' | 'image' | 'video' | 'voice' | 'audio' | 'file' | 'location' | 'poll' | 'sticker' | 'encrypted' | 'call' | 'emote' | 'none'

export interface PreviewEvent {
  type: string
  sender: string
  content: Record<string, unknown>
  redacted?: boolean
}

export interface Preview {
  kind: PreviewKind
  /** The message itself, without who sent it. */
  text: string
  mine: boolean
  /** Sender's display name (empty when it is me or unknown). */
  who: string
}

/** Drop the quoted lines a reply carries in its plain body ("> <@a:b> text"). */
export const stripReplyFallback = (body: string): string => {
  if (!body.startsWith('> ')) return body
  const lines = body.split('\n')
  let i = 0
  while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) i++
  while (i < lines.length && lines[i] === '') i++
  return lines.slice(i).join('\n')
}

export const isPreviewable = (e: PreviewEvent): boolean =>
  !e.redacted && ['m.room.message', 'm.room.encrypted', 'm.sticker', 'm.poll.start', 'org.matrix.msc3381.poll.start', 'm.call.invite', 'm.rtc.notification'].includes(e.type)

export function describe(e: PreviewEvent, me: string, nameOf: (id: string) => string | undefined, plain: (body: string) => string = (b) => b): Preview {
  const mine = e.sender === me
  const who = mine ? '' : (nameOf(e.sender) ?? '')
  const c = e.content
  const body = typeof c.body === 'string' ? c.body : ''
  const mk = (kind: PreviewKind, text: string): Preview => ({ kind, text, mine, who })
  if (e.type === 'm.room.encrypted' || c.msgtype === 'm.bad.encrypted') return mk('encrypted', 'Encrypted message')
  if (e.type === 'm.sticker') return mk('sticker', body ? `Sticker: ${body}` : 'Sticker')
  if (e.type.endsWith('poll.start')) {
    const q = ((c['m.poll'] ?? c['org.matrix.msc3381.poll.start']) as { question?: Record<string, string> } | undefined)?.question
    return mk('poll', `Poll: ${q?.['m.text'] ?? q?.['org.matrix.msc1767.text'] ?? q?.body ?? ''}`.trim())
  }
  if (e.type === 'm.call.invite' || e.type === 'm.rtc.notification') return mk('call', 'Call')
  const caption = (fallback: string) => {
    const t = stripReplyFallback(body).trim()
    // for media the body is the file name unless a caption was sent
    return c.filename && c.filename !== t && t ? `${fallback}: ${t}` : fallback
  }
  switch (c.msgtype) {
    case 'm.image': return mk('image', caption('Photo'))
    case 'm.video': return mk('video', caption('Video'))
    case 'm.audio': return c['org.matrix.msc3245.voice'] !== undefined ? mk('voice', 'Voice message') : mk('audio', 'Audio')
    case 'm.file': return mk('file', body ? `File: ${body}` : 'File')
    case 'm.location': return mk('location', 'Location')
    case 'm.emote': return mk('emote', plain(stripReplyFallback(body)))
    default: return mk('text', plain(stripReplyFallback(body)).replace(/\s+/g, ' ').trim())
  }
}

/** The single line shown under a room's name. */
export function previewLine(p: Preview, isDM: boolean): string {
  if (p.kind === 'none') return ''
  if (p.kind === 'emote') return `${p.mine ? 'You' : p.who} ${p.text}`.trim()
  const prefix = p.mine ? 'You: ' : !isDM && p.who ? `${p.who}: ` : ''
  return prefix + p.text
}

export type RoomOrder = 'activity' | 'unread' | 'name'
interface Sortable { name: string; lastTs: number; unread: number; highlight: number; favourite: boolean; lowPriority: boolean; notifs: string }

/** Favourites first, low priority last; then by the chosen order. Ties fall back to activity. */
export function sortRooms<T extends Sortable>(items: T[], order: RoomOrder): T[] {
  const tier = (r: T) => (r.favourite ? 0 : r.lowPriority ? 2 : 1)
  const attention = (r: T) => (r.notifs === 'mute' ? 0 : r.highlight > 0 ? 2 : r.unread > 0 ? 1 : 0)
  return [...items].sort((a, b) =>
    tier(a) - tier(b) ||
    (order === 'unread' ? attention(b) - attention(a) : 0) ||
    (order === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : 0) ||
    b.lastTs - a.lastTs,
  )
}
