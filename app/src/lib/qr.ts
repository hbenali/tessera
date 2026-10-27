/** QR helpers for device verification. Loaded only when the verification dialog opens. */
import qrcode from 'qrcode-generator'
import jsQR from 'jsqr'

/** The QR modules for raw bytes. Verification payloads are binary, so no text encoding may touch them. */
export function modules(bytes: Uint8ClampedArray): boolean[][] {
  const qr = qrcode(0, 'Q')
  // The default build maps each char code 0-255 to one byte, which is what a binary payload needs.
  qr.addData(String.fromCharCode(...bytes), 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/** The bytes in a QR code found in an image, or null. */
export function decode(img: { data: Uint8ClampedArray; width: number; height: number }): Uint8ClampedArray | null {
  const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
  return hit ? Uint8ClampedArray.from(hit.binaryData) : null
}
