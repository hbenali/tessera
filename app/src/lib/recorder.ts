/** Voice recording with MediaRecorder. SDK-free. */
export interface Recorded {
  blob: Blob
  /** Milliseconds. */
  duration: number
  /** Up to 100 loudness values, 0-1024: what other clients draw as the waveform. */
  waveform: number[]
  mimetype: string
}

export interface Recording {
  stop(): Promise<Recorded>
  cancel(): void
  /** Current loudness, 0-1. */
  level(): number
  /** Milliseconds recorded so far. */
  elapsed(): number
}

export const MAX_MS = 10 * 60_000

const TYPES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']
export const supportedType = (): string | undefined => (typeof MediaRecorder === 'undefined' ? undefined : TYPES.find((t) => MediaRecorder.isTypeSupported(t)))
export const canRecord = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!supportedType()

/** Loudness samples to at most `points` bars, scaled 0-1024. Quiet recordings are not blown up into loud-looking noise. */
export function waveformOf(levels: number[], points = 100): number[] {
  if (!levels.length) return []
  const n = Math.min(points, levels.length)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * levels.length) / n)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n))
    out.push(Math.max(...levels.slice(from, to)))
  }
  const top = Math.max(...out, 0.08) // a floor, so silence stays low
  return out.map((v) => Math.round(Math.min(1, v / top) * 1024))
}

export async function startRecording(): Promise<Recording> {
  const mimeType = supportedType()
  if (!mimeType) throw new Error('This browser cannot record audio')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 }) // a voice, not music: small files
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  const levels: number[] = []
  let current = 0
  const sample = setInterval(() => {
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += v * v
    const rms = Math.sqrt(sum / buf.length)
    current = Math.min(1, rms * 3.2) // speech sits low in the range; scale it so the meter moves
    levels.push(rms)
  }, 80)

  const started = performance.now()
  let ended = false
  const release = () => {
    if (ended) return
    ended = true
    clearInterval(sample)
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }
  rec.start(250)

  return {
    level: () => current,
    elapsed: () => (ended ? 0 : performance.now() - started),
    cancel() {
      rec.ondataavailable = null
      if (rec.state !== 'inactive') rec.stop()
      release()
    },
    stop() {
      const duration = performance.now() - started
      return new Promise<Recorded>((resolve, reject) => {
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: rec.mimeType || mimeType })
          release()
          if (!blob.size) reject(new Error('Nothing was recorded'))
          else resolve({ blob, duration, waveform: waveformOf(levels), mimetype: (rec.mimeType || mimeType).split(';')[0] })
        }
        rec.onerror = () => { release(); reject(new Error('Recording failed')) }
        if (rec.state !== 'inactive') rec.stop()
      })
    },
  }
}
