// The public room directory, as the room list needs it. SDK-free.
export interface PublicRoom {
  id: string
  name: string
  alias?: string
  topic?: string
  members: number
  avatar?: string
  /** Anyone can join, or you have to ask. */
  join: 'public' | 'knock'
}

interface Raw { room_id: string; name?: string; canonical_alias?: string; topic?: string; num_joined_members?: number; avatar_url?: string; join_rule?: string }

export const toPublicRoom = (r: Raw): PublicRoom => ({
  id: r.room_id,
  name: r.name?.trim() || r.canonical_alias || r.room_id,
  alias: r.canonical_alias,
  topic: r.topic?.trim() || undefined,
  members: r.num_joined_members ?? 0,
  avatar: r.avatar_url,
  join: r.join_rule === 'knock' || r.join_rule === 'knock_restricted' ? 'knock' : 'public',
})

/** Biggest rooms first, then by name; rooms I am already in are left out. */
export const rank = (rooms: PublicRoom[], mine: Set<string>): PublicRoom[] =>
  rooms.filter((r) => !mine.has(r.id)).sort((a, b) => b.members - a.members || a.name.localeCompare(b.name))

/** A server name typed after the search ("topic @ matrix.org") picks another server's directory. */
export function splitServer(input: string): { term: string; server?: string } {
  const m = /^(.*?)\s*@\s*([a-z0-9.-]+\.[a-z]{2,}(?::\d+)?)\s*$/i.exec(input)
  return m ? { term: m[1].trim(), server: m[2].toLowerCase() } : { term: input.trim() }
}
