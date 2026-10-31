// Element-compatible encrypted room-key files ("-----BEGIN MEGOLM SESSION DATA-----"), made with WebCrypto.
// Layout of the decoded bytes: version 1 | salt 16 | iv 16 | rounds 4 (big endian) | AES-256-CTR ciphertext | HMAC-SHA256 32.
const HEAD = '-----BEGIN MEGOLM SESSION DATA-----'
const TAIL = '-----END MEGOLM SESSION DATA-----'
const enc = new TextEncoder()

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function keys(pass: string, salt: Uint8Array, rounds: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: rounds, hash: 'SHA-512' }, base, 512))
  return {
    aes: await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-CTR', false, ['encrypt', 'decrypt']),
    mac: await crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
  }
}

export async function encryptKeyFile(json: string, pass: string, rounds = 500_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(16))
  iv[8] &= 0x7f // keep the counter from overflowing into the nonce
  const { aes, mac } = await keys(pass, salt, rounds)
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CTR', counter: iv as BufferSource, length: 64 }, aes, enc.encode(json)))
  const out = new Uint8Array(1 + 16 + 16 + 4 + body.length + 32)
  out[0] = 1
  out.set(salt, 1)
  out.set(iv, 17)
  new DataView(out.buffer).setUint32(33, rounds)
  out.set(body, 37)
  out.set(new Uint8Array(await crypto.subtle.sign('HMAC', mac, out.subarray(0, 37 + body.length))), 37 + body.length)
  const lines = b64(out).match(/.{1,96}/g) ?? []
  return `${HEAD}\n${lines.join('\n')}\n${TAIL}\n`
}

export async function decryptKeyFile(file: string, pass: string): Promise<string> {
  const t = file.trim()
  if (!t.startsWith(HEAD) || !t.endsWith(TAIL)) throw new Error('This is not a Matrix room key file')
  let data: Uint8Array
  try { data = unb64(t.slice(HEAD.length, t.length - TAIL.length).replace(/\s+/g, '')) } catch { throw new Error('The key file is damaged') }
  if (data.length < 37 + 32 || data[0] !== 1) throw new Error('This key file version is not supported')
  const rounds = new DataView(data.buffer, data.byteOffset).getUint32(33)
  if (rounds < 1 || rounds > 2_000_000) throw new Error('The key file is damaged')
  const { aes, mac } = await keys(pass, data.slice(1, 17), rounds)
  const signed = data.subarray(0, data.length - 32)
  if (!(await crypto.subtle.verify('HMAC', mac, data.slice(data.length - 32) as BufferSource, signed as BufferSource))) throw new Error('Wrong passphrase, or the file is damaged')
  const plain = await crypto.subtle.decrypt({ name: 'AES-CTR', counter: data.slice(17, 33) as BufferSource, length: 64 }, aes, data.slice(37, data.length - 32))
  return new TextDecoder().decode(plain)
}
