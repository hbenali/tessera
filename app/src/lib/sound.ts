/** The message sound: made with Web Audio, so there is no file to load. SDK-free. */
export type Style = 'chime' | 'blip' | 'pop'
export const STYLES: { id: Style; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'blip', label: 'Blip' },
  { id: 'pop', label: 'Pop' },
]

const ON = 'tessera.sound'
const STYLE = 'tessera.soundStyle'
const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* not remembered in private mode */
  }
}

export const soundOn = (): boolean => read(ON) !== '0'
export const setSoundOn = (on: boolean) => write(ON, on ? '1' : '0')
export const soundStyle = (): Style => (STYLES.some((s) => s.id === read(STYLE)) ? (read(STYLE) as Style) : 'chime')
export const setSoundStyle = (s: Style) => write(STYLE, s)

let ctx: AudioContext | null = null
let last = 0
const lastByRoom = new Map<string, number>()

// Not noisy, not repetitive: one sound covers a burst, and a chatty room does not sound again for a minute. A mention
// is allowed through sooner (it is why you would want a sound at all), but still not in quick succession.
const GAP_MESSAGE = 8_000 // between any two sounds
const GAP_MENTION = 3_000
const GAP_ROOM = 60_000 // between plain messages from the same room

/** Browsers only let a page make sound once the person has clicked or typed in it, so the audio context waits for that. */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return
  const make = () => {
    ctx ??= new AudioContext()
    void ctx.resume()
    removeEventListener('pointerdown', make, true)
    removeEventListener('keydown', make, true)
  }
  addEventListener('pointerdown', make, true)
  addEventListener('keydown', make, true)
}

/** One soft note: a sine with a faint octave above it for a bell-like tone, a quick attack and a smooth decay (no clicks). */
function note(c: AudioContext, at: number, hz: number, len: number, peak: number, glideTo?: number, type: OscillatorType = 'sine') {
  const gain = c.createGain()
  gain.connect(c.destination)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + len)
  const voices: [number, number][] = type === 'sine' ? [[1, 1], [2, 0.18]] : [[1, 1]]
  for (const [mult, level] of voices) {
    const o = c.createOscillator()
    const g = c.createGain()
    g.gain.value = level
    o.type = type
    o.frequency.setValueAtTime(hz * mult, at)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo * mult, at + len * 0.7)
    o.connect(g).connect(gain)
    o.start(at)
    o.stop(at + len + 0.03)
  }
}

const PEAK = 0.09 // quiet on purpose: it plays all day

/** Play the sound. A mention gets a longer, rising version so it can be told apart without looking. */
export function beep(kind: 'message' | 'mention' = 'message', opts: { force?: boolean; style?: Style; room?: string } = {}): boolean {
  if ((!opts.force && !soundOn()) || !ctx || ctx.state !== 'running') return false
  const now = performance.now()
  if (!opts.force) {
    if (now - last < (kind === 'mention' ? GAP_MENTION : GAP_MESSAGE)) return false
    if (kind === 'message' && opts.room && now - (lastByRoom.get(opts.room) ?? -Infinity) < GAP_ROOM) return false
  }
  last = now
  if (opts.room) lastByRoom.set(opts.room, now)
  const t = ctx.currentTime + 0.01
  const mention = kind === 'mention'
  switch (opts.style ?? soundStyle()) {
    case 'chime':
      if (mention) [1046.5, 1318.5, 1568].forEach((hz, i) => note(ctx!, t + i * 0.095, hz, 0.3, PEAK))
      else [784, 1046.5].forEach((hz, i) => note(ctx!, t + i * 0.095, hz, 0.26, PEAK))
      break
    case 'blip':
      note(ctx, t, 1300, 0.12, PEAK, 880)
      if (mention) note(ctx, t + 0.13, 1500, 0.14, PEAK, 1000)
      break
    case 'pop':
      note(ctx, t, 520, 0.1, PEAK * 1.3, 260, 'triangle')
      if (mention) note(ctx, t + 0.12, 620, 0.1, PEAK * 1.3, 300, 'triangle')
      break
  }
  return true
}
