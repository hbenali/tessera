import { describe, expect, it } from 'vitest'
import { inviteTarget, isKnown, parseCommand, shrug } from './commands'

describe('slash commands', () => {
  it('recognises a command and its argument', () => {
    expect(parseCommand('/invite @bob:x.org')).toEqual({ command: { name: 'invite', arg: '@bob:x.org' } })
    expect(parseCommand('/INVITE   Dave Grohl  ')).toEqual({ command: { name: 'invite', arg: 'Dave Grohl' } })
    expect(parseCommand('/invite')).toEqual({ command: { name: 'invite', arg: '' } })
    expect(parseCommand('/me waves')).toEqual({ command: { name: 'me', arg: 'waves' } })
  })
  it('is not fooled by ordinary text, and a doubled slash sends a literal slash', () => {
    expect(parseCommand('hello /invite')).toBeNull()
    expect(parseCommand('see /etc/hosts for it')).toBeNull() // a path after a word, not a command
    expect(parseCommand('//etc/hosts is the file')).toEqual({ send: '/etc/hosts is the file' })
  })
  it('knows which commands exist', () => {
    expect(isKnown('invite') && isKnown('me') && isKnown('shrug')).toBe(true)
    expect(isKnown('nope')).toBe(false)
  })
  it('builds a shrug', () => {
    expect(shrug('')).toBe('¯\\_(ツ)_/¯')
    expect(shrug('no idea')).toBe('no idea ¯\\_(ツ)_/¯')
  })
  it('works out who to invite', () => {
    expect(inviteTarget('@bob:x.org')).toEqual({ id: '@bob:x.org' })
    expect(inviteTarget('@bob')).toEqual({ search: 'bob' })
    expect(inviteTarget('Dave Grohl')).toEqual({ search: 'Dave Grohl' })
    expect(inviteTarget('  ')).toBeNull()
  })
})
