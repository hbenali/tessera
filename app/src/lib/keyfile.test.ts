import { describe, expect, it } from 'vitest'
import { decryptKeyFile, encryptKeyFile } from './keyfile'

describe('room key file', () => {
  const json = JSON.stringify([{ algorithm: 'm.megolm.v1.aes-sha2', room_id: '!r:x', session_id: 's', session_key: 'k' }])
  it('round-trips with the right passphrase', async () => {
    const file = await encryptKeyFile(json, 'correct horse', 1000)
    expect(file.startsWith('-----BEGIN MEGOLM SESSION DATA-----\n')).toBe(true)
    expect(file.trimEnd().endsWith('-----END MEGOLM SESSION DATA-----')).toBe(true)
    expect(file).not.toContain('session_key')
    expect(await decryptKeyFile(file, 'correct horse')).toBe(json)
  })
  it('rejects a wrong passphrase and a tampered file', async () => {
    const file = await encryptKeyFile(json, 'pw', 1000)
    await expect(decryptKeyFile(file, 'other')).rejects.toThrow(/Wrong passphrase/)
    const lines = file.split('\n')
    lines[1] = (lines[1][60] === 'A' ? lines[1].slice(0, 60) + 'B' : lines[1].slice(0, 60) + 'A') + lines[1].slice(61)
    await expect(decryptKeyFile(lines.join('\n'), 'pw')).rejects.toThrow()
  })
  it('rejects something that is not a key file', async () => {
    await expect(decryptKeyFile('hello', 'pw')).rejects.toThrow(/not a Matrix room key file/)
  })
  it('uses a fresh salt each time', async () => {
    expect(await encryptKeyFile(json, 'pw', 1000)).not.toBe(await encryptKeyFile(json, 'pw', 1000))
  })
})
