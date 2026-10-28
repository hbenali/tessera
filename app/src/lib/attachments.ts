/**
 * Encrypted attachments for encrypted rooms (the Matrix "v2" EncryptedFile format): the file is encrypted with a fresh
 * AES-256-CTR key before it is uploaded, and the key, IV and a SHA-256 of the ciphertext travel inside the encrypted
 * message. The homeserver only ever stores ciphertext. SDK-free, built on the browser's WebCrypto.
 */
export interface EncryptedFile {
  url: string
  key: { kty: 'oct'; key_ops: string[]; alg: 'A256CTR'; k: string; ext: true }
  iv: string // unpadded base64
  hashes: { sha256: string } // unpadded base64
  v: 'v2'
  mimetype?: string
}

const toBytes = (b: ArrayBuffer | Uint8Array): Uint8Array => (b instanceof Uint8Array ? b : new Uint8Array(b))

const b64 = (b: ArrayBuffer | Uint8Array): string => {
  let s = ''
  for (const x of toBytes(b)) s += String.fromCharCode(x)
  return btoa(s).replace(/=+$/, '')
}

/** Base64, standard or URL-safe, padded or not: other clients are not all strict about it. */
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export async function encryptAttachment(data: ArrayBuffer): Promise<{ ciphertext: ArrayBuffer; file: Omit<EncryptedFile, 'url' | 'mimetype'> }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-CTR', length: 256 }, true, ['encrypt', 'decrypt'])
  // Half the counter block is random, half starts at zero, so the counter cannot wrap for any file we can hold in memory.
  const iv = new Uint8Array(16)
  crypto.getRandomValues(iv.subarray(0, 8))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, data)
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return {
    ciphertext,
    file: {
      key: { kty: 'oct', key_ops: ['encrypt', 'decrypt'], alg: 'A256CTR', k: jwk.k!, ext: true },
      iv: b64(iv),
      hashes: { sha256: b64(await crypto.subtle.digest('SHA-256', ciphertext)) },
      v: 'v2',
    },
  }
}

/** Is this the shape of an EncryptedFile we can use? The content comes from another person's client. */
export function isEncryptedFile(f: unknown): f is EncryptedFile {
  const x = f as Partial<EncryptedFile> | null
  return (
    !!x &&
    typeof x.url === 'string' &&
    x.v === 'v2' &&
    x.key?.alg === 'A256CTR' &&
    x.key.kty === 'oct' &&
    typeof x.key.k === 'string' &&
    typeof x.iv === 'string' &&
    typeof x.hashes?.sha256 === 'string'
  )
}

/** Decrypt downloaded ciphertext. Throws if the hash does not match (a corrupted or tampered file) or the file is malformed. */
export async function decryptAttachment(ciphertext: ArrayBuffer, file: Pick<EncryptedFile, 'key' | 'iv' | 'hashes'>): Promise<ArrayBuffer> {
  const expected = fromB64(file.hashes.sha256)
  const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext))
  if (expected.length !== actual.length || expected.some((v, i) => v !== actual[i])) throw new Error('The attachment does not match its checksum')
  const iv = fromB64(file.iv)
  if (iv.length !== 16) throw new Error('The attachment has a bad IV')
  const key = await crypto.subtle.importKey('jwk', { ...file.key, key_ops: ['decrypt'] }, { name: 'AES-CTR' }, false, ['decrypt'])
  return crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, ciphertext)
}
