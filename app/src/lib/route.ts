/** Hash routes: `#/room/<id>` and `#/room/<id>/<event id>`. A hash works on any static host, including GitHub Pages. */
export interface Route {
  room?: string
  event?: string
}

export function parse(hash: string): Route {
  const m = /^#?\/room\/([^/?]+)(?:\/([^/?]+))?\/?$/.exec(hash)
  if (!m) return {}
  try {
    const room = decodeURIComponent(m[1])
    // Matrix ids and aliases start with a sigil; anything else is not a room reference.
    if (!/^[!#][^\s]*$/.test(room)) return {}
    const event = m[2] ? decodeURIComponent(m[2]) : undefined
    return event && /^\$\S+$/.test(event) ? { room, event } : { room }
  } catch {
    return {}
  }
}

export function format(r: Route): string {
  if (!r.room) return ''
  const room = encodeURIComponent(r.room)
  return r.event ? `#/room/${room}/${encodeURIComponent(r.event)}` : `#/room/${room}`
}
