/** Slash commands typed in the message box. Pure, so the rules are easy to test. */
export interface Command {
  name: string
  arg: string
}

export const COMMANDS: { name: string; usage: string; help: string }[] = [
  { name: 'invite', usage: '/invite @person', help: 'Invite someone to this room, by Matrix id, short name or display name' },
  { name: 'me', usage: '/me text', help: 'Say something about yourself in the third person' },
  { name: 'shrug', usage: '/shrug [text]', help: 'Add ¯\\_(ツ)_/¯ to a message' },
]

export type Parsed = { command: Command } | { send: string } | null

/**
 * "/word ..." is a command, so a mistyped one is never sent to the room by accident. A message that really starts with a
 * slash (a path, say) is sent by doubling it: "//etc/hosts" sends "/etc/hosts".
 */
export function parseCommand(body: string): Parsed {
  if (body.startsWith('//')) return { send: body.slice(1) }
  const m = /^\/([A-Za-z]+)(?:\s+([\s\S]*))?$/.exec(body.trim())
  if (!m) return null
  return { command: { name: m[1].toLowerCase(), arg: (m[2] ?? '').trim() } }
}

export const isKnown = (name: string) => COMMANDS.some((c) => c.name === name)

/** The text of a /shrug message. */
export const shrug = (arg: string) => (arg ? `${arg} ¯\\_(ツ)_/¯` : '¯\\_(ツ)_/¯')

const FULL_ID = /^@[a-z0-9._=\-/+]+:[a-z0-9.\-]+(?::\d{1,5})?$/i

/** What was typed after /invite: a full id, a short name on this server (with or without @), or a name to look up. */
export function inviteTarget(arg: string): { id: string } | { search: string } | null {
  const a = arg.trim()
  if (!a) return null
  if (FULL_ID.test(a)) return { id: a }
  // Anything else is looked up in the user directory: a short name, with or without @, or a display name.
  return { search: a.replace(/^@/, '') }
}
