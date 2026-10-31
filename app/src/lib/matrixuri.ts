// matrix: links (MSC2312): matrix:r/alias:server, matrix:roomid/!id:server[/e/$event], matrix:u/user:server. SDK-free.
export type MatrixLink =
  | { kind: 'room'; ref: string; event?: string; via: string[] }
  | { kind: 'user'; id: string }

const SERVER = /^[a-z0-9.\-]+(:\d{1,5})?$/i
const LOCAL = /^[^\s:@!#$?&/\\<>"'`]{1,200}$/
const USERNAME = /^[a-z0-9._=\-/+]{1,200}$/i
const EVENT = /^[A-Za-z0-9_\-+/=]{1,100}$/

/** Parse a matrix: or web+matrix: link. Anything that is not a well-formed reference to a room, an event or a person is refused. */
export function parseMatrixUri(input: string): MatrixLink | null {
  const m = /^(?:web\+matrix|matrix):(?:\/\/[^/]*\/)?([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i.exec(input.trim())
  if (!m || input.length > 600) return null
  const parts = m[1].split('/').map((p) => { try { return decodeURIComponent(p) } catch { return '\0' } })
  if (parts.some((p) => p === '\0')) return null
  const [kind, name, sub, ev] = parts
  const split = (s: string, sigil: string, local: RegExp) => {
    const i = s.indexOf(':') // the local part never contains one, the server name may (a port)
    const l = s.slice(0, i)
    const server = s.slice(i + 1)
    return i > 0 && local.test(l) && SERVER.test(server) ? sigil + l + ':' + server : null
  }
  if (kind === 'u' && name && parts.length === 2) {
    const id = split(name, '@', USERNAME)
    return id ? { kind: 'user', id } : null
  }
  if ((kind === 'r' || kind === 'roomid') && name) {
    const ref = split(name, kind === 'r' ? '#' : '!', LOCAL)
    if (!ref) return null
    let event: string | undefined
    if (parts.length > 2) {
      if (sub !== 'e' || !ev || parts.length !== 4 || !EVENT.test(ev)) return null
      event = '$' + ev
    }
    const via = new URLSearchParams(m[2] ?? '').getAll('via').filter((v) => SERVER.test(v)).slice(0, 8)
    return { kind: 'room', ref, event, via }
  }
  return null
}
