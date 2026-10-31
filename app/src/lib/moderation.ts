// Who may do what in a room, from the m.room.power_levels content. SDK-free so it can be tested.
export interface PowerLevels {
  users?: Record<string, number>
  users_default?: number
  events?: Record<string, number>
  events_default?: number
  state_default?: number
  kick?: number
  ban?: number
  redact?: number
  invite?: number
}

export const levelOf = (pl: PowerLevels, user: string): number => pl.users?.[user] ?? pl.users_default ?? 0
const need = (pl: PowerLevels, key: 'kick' | 'ban' | 'redact', fallback: number) => pl[key] ?? fallback

export const canKick = (pl: PowerLevels, me: string, target: string) => me !== target && levelOf(pl, me) >= need(pl, 'kick', 50) && levelOf(pl, me) > levelOf(pl, target)
export const canBan = (pl: PowerLevels, me: string, target: string) => me !== target && levelOf(pl, me) >= need(pl, 'ban', 50) && levelOf(pl, me) > levelOf(pl, target)
export const canRedactOthers = (pl: PowerLevels, me: string) => levelOf(pl, me) >= need(pl, 'redact', 50)
export const canSetState = (pl: PowerLevels, me: string, type: string) => levelOf(pl, me) >= (pl.events?.[type] ?? pl.state_default ?? 50)

/** Changing someone's level needs the right to change power levels, a level not above mine, and a target below me (or myself). */
export const canSetLevel = (pl: PowerLevels, me: string, target: string, next: number) =>
  canSetState(pl, me, 'm.room.power_levels') && next <= levelOf(pl, me) && (target === me || levelOf(pl, target) < levelOf(pl, me))

export type Role = 'admin' | 'moderator' | 'member' | 'custom'
export const ROLE_LEVEL: Record<Exclude<Role, 'custom'>, number> = { admin: 100, moderator: 50, member: 0 }
export const roleOf = (level: number): Role => (level >= 100 ? 'admin' : level === 50 ? 'moderator' : level === 0 ? 'member' : 'custom')
export const roleLabel = (level: number): string => ({ admin: 'Admin', moderator: 'Moderator', member: 'Member', custom: `Custom (${level})` })[roleOf(level)]

/** New power-levels content with one user's level changed; level 0 removes the entry. Never mutates the input. */
export function withLevel(pl: PowerLevels, user: string, level: number): PowerLevels {
  const users = { ...(pl.users ?? {}) }
  if (level === (pl.users_default ?? 0)) delete users[user]
  else users[user] = level
  return { ...pl, users }
}

export type JoinRule = 'invite' | 'public' | 'knock'
export type History = 'shared' | 'invited' | 'joined' | 'world_readable'
export const JOIN_RULES: [JoinRule, string, string][] = [
  ['invite', 'Invite only', 'People need an invitation'],
  ['knock', 'Ask to join', 'People can request to join; a moderator accepts'],
  ['public', 'Public', 'Anyone who finds the room can join'],
]
export const HISTORY: [History, string, string][] = [
  ['shared', 'Members, since the room began', 'New members read the whole history'],
  ['invited', 'Members, since they were invited', 'History starts at the invitation'],
  ['joined', 'Members, since they joined', 'History starts when they join'],
  ['world_readable', 'Anyone, even without joining', 'The room can be read publicly'],
]
