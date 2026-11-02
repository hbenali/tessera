/** The browser tab title: the unread count first (the eXo extension reads it from the start), then the room, then the app name once. */
export function pageTitle(unread: number, room?: string): string {
  const count = unread ? `(${unread}) ` : ''
  const name = room?.trim()
  return name && name.toLowerCase() !== 'tessera' ? `${count}${name} · Tessera` : `${count}Tessera`
}
