/**
 * The browser tab title: the unread count first (the eXo extension reads it from the start), then the room, then the app name once.
 * An installed app's window already shows the app name beside the title, so there the name is left out whenever there is something else to show.
 */
export function pageTitle(unread: number, room?: string, installed = false): string {
  const count = unread ? `(${unread}) ` : ''
  const name = room?.trim()
  const named = name && name.toLowerCase() !== 'tessera' ? name : ''
  if (installed && (named || count)) return `${count}${named}`.trim()
  return named ? `${count}${named} · Tessera` : `${count}Tessera`
}
