import { describe, expect, it } from 'vitest'
import { canBan, canKick, canRedactOthers, canSetLevel, canSetState, levelOf, roleLabel, roleOf, withLevel } from './moderation'

const pl = { users: { '@admin:x': 100, '@mod:x': 50 }, events: { 'm.room.name': 50, 'm.room.power_levels': 100 } }

describe('moderation rules', () => {
  it('reads levels with a default of 0', () => { expect(levelOf(pl, '@admin:x')).toBe(100); expect(levelOf(pl, '@nobody:x')).toBe(0); expect(levelOf({ users_default: 10 }, '@n:x')).toBe(10) })
  it('a moderator can kick a member but not an admin or a peer, nor themselves', () => {
    expect(canKick(pl, '@mod:x', '@m:x')).toBe(true)
    expect(canKick(pl, '@mod:x', '@admin:x')).toBe(false)
    expect(canKick(pl, '@mod:x', '@mod:x')).toBe(false)
    expect(canKick(pl, '@m:x', '@n:x')).toBe(false)
  })
  it('ban follows the same rule and honours a custom threshold', () => {
    expect(canBan(pl, '@mod:x', '@m:x')).toBe(true)
    expect(canBan({ ...pl, ban: 100 }, '@mod:x', '@m:x')).toBe(false)
  })
  it('redact needs the redact level', () => { expect(canRedactOthers(pl, '@mod:x')).toBe(true); expect(canRedactOthers(pl, '@m:x')).toBe(false) })
  it('state events use their own level, then the default', () => {
    expect(canSetState(pl, '@mod:x', 'm.room.name')).toBe(true)
    expect(canSetState(pl, '@mod:x', 'm.room.power_levels')).toBe(false)
    expect(canSetState(pl, '@mod:x', 'm.room.topic')).toBe(true)
    expect(canSetState({ state_default: 100 }, '@mod:x', 'm.room.topic')).toBe(false)
  })
  it('only someone who may edit power levels can promote, never above themselves', () => {
    expect(canSetLevel(pl, '@admin:x', '@m:x', 50)).toBe(true)
    expect(canSetLevel(pl, '@mod:x', '@m:x', 50)).toBe(false)
    expect(canSetLevel({ ...pl, events: {} , state_default: 50 }, '@mod:x', '@m:x', 100)).toBe(false)
    expect(canSetLevel(pl, '@admin:x', '@admin:x', 50)).toBe(true)
  })
  it('names roles', () => { expect(roleOf(100)).toBe('admin'); expect(roleLabel(50)).toBe('Moderator'); expect(roleLabel(0)).toBe('Member'); expect(roleLabel(25)).toBe('Custom (25)') })
  it('withLevel does not mutate and drops the default level', () => {
    const next = withLevel(pl, '@m:x', 50)
    expect(next.users).toMatchObject({ '@m:x': 50, '@admin:x': 100 })
    expect(pl.users).not.toHaveProperty('@m:x')
    expect(withLevel(next, '@m:x', 0).users).not.toHaveProperty('@m:x')
  })
})
