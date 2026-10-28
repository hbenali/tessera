/// <reference types="node" />
import { createDecipheriv, createCipheriv, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptAttachment, encryptAttachment, isEncryptedFile } from './attachments'

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) % 256)
const unb64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

describe('encrypted attachments', () => {
  it('round-trips, including a size that is not a multiple of the block', async () => {
    for (const n of [0, 1, 15, 16, 17, 1000, 70_001]) {
      const data = bytes(n)
      const { ciphertext, file } = await encryptAttachment(data.buffer)
      expect(ciphertext.byteLength).toBe(n)
      if (n > 16) expect(Buffer.from(ciphertext).equals(Buffer.from(data))).toBe(false)
      expect(Buffer.from(await decryptAttachment(ciphertext, file)).equals(Buffer.from(data))).toBe(true)
    }
  })
  it('matches the format: AES-256-CTR with a 128-bit counter block, and a SHA-256 of the ciphertext', async () => {
    const data = bytes(5000)
    const { ciphertext, file } = await encryptAttachment(data.buffer)
    // An independent implementation (Node's) decrypts what WebCrypto produced.
    const d = createDecipheriv('aes-256-ctr', unb64(file.key.k), unb64(file.iv))
    expect(Buffer.concat([d.update(Buffer.from(ciphertext)), d.final()]).equals(Buffer.from(data))).toBe(true)
    expect(file.hashes.sha256).toBe(createHash('sha256').update(Buffer.from(ciphertext)).digest('base64').replace(/=+$/, ''))
    expect(unb64(file.iv)).toHaveLength(16)
    expect(unb64(file.iv).subarray(8).every((b) => b === 0)).toBe(true) // the counter half starts at zero
    expect(file).toMatchObject({ v: 'v2', key: { kty: 'oct', alg: 'A256CTR', ext: true } })
  })
  it('decrypts what another client produced', async () => {
    const key = Buffer.alloc(32, 9)
    const iv = Buffer.concat([Buffer.alloc(8, 3), Buffer.alloc(8)])
    const c = createCipheriv('aes-256-ctr', key, iv)
    const plain = Buffer.from('hello from another client')
    const cipher = Buffer.concat([c.update(plain), c.final()])
    const out = await decryptAttachment(cipher.buffer.slice(cipher.byteOffset, cipher.byteOffset + cipher.length), {
      key: { kty: 'oct', key_ops: ['encrypt', 'decrypt'], alg: 'A256CTR', k: key.toString('base64url'), ext: true },
      iv: iv.toString('base64'), // padded standard base64 is accepted too
      hashes: { sha256: createHash('sha256').update(cipher).digest('base64') },
    })
    expect(Buffer.from(out).toString()).toBe('hello from another client')
  })
  it('refuses a file that was changed, or has the wrong hash', async () => {
    const { ciphertext, file } = await encryptAttachment(bytes(300).buffer)
    const tampered = new Uint8Array(ciphertext.slice(0))
    tampered[10] ^= 1
    await expect(decryptAttachment(tampered.buffer, file)).rejects.toThrow(/checksum/)
    await expect(decryptAttachment(ciphertext, { ...file, hashes: { sha256: 'AAAA' } })).rejects.toThrow(/checksum/)
  })
  it('recognises the shape of a usable file and nothing else', async () => {
    const { file } = await encryptAttachment(bytes(4).buffer)
    expect(isEncryptedFile({ ...file, url: 'mxc://x/y' })).toBe(true)
    expect(isEncryptedFile({ ...file, url: 'mxc://x/y', v: 'v1' })).toBe(false)
    expect(isEncryptedFile({ ...file, url: 7 })).toBe(false)
    expect(isEncryptedFile(null)).toBe(false)
    expect(isEncryptedFile('mxc://x/y')).toBe(false)
  })
})
