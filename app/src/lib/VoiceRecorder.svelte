<script lang="ts">
  import { MAX_MS, startRecording, type Recorded, type Recording } from './recorder'
  import Icon from './Icon.svelte'

  let { onsend, oncancel, onerror }: { onsend: (r: Recorded) => void; oncancel: () => void; onerror: (why: string) => void } = $props()

  let rec: Recording | undefined
  let ms = $state(0)
  let levels = $state<number[]>(Array(36).fill(0))
  let ready = $state(false)
  let busy = false

  $effect(() => {
    let live = true
    startRecording().then(
      (r) => {
        if (!live) return r.cancel()
        rec = r
        ready = true
      },
      (e) => {
        if (!live) return
        const name = (e as DOMException).name
        onerror(
          name === 'NotAllowedError' || name === 'SecurityError' ? 'Microphone access is blocked. Allow it for this site in your browser settings.'
          : name === 'NotFoundError' ? 'No microphone was found.'
          : e instanceof Error ? e.message : 'The microphone could not be started.',
        )
      },
    )
    const tick = setInterval(() => {
      if (!rec) return
      ms = rec.elapsed()
      levels = [...levels.slice(1), rec.level()]
      if (ms >= MAX_MS) send() // ten minutes is the limit
    }, 80)
    return () => { live = false; clearInterval(tick); rec?.cancel() }
  })

  async function send() {
    if (!rec || busy) return
    busy = true
    const r = rec
    rec = undefined
    try {
      const out = await r.stop()
      if (out.duration < 600) return oncancel() // a tap, not a message
      onsend(out)
    } catch (e) {
      onerror(e instanceof Error ? e.message : 'Recording failed')
    }
  }
  function cancel() { rec?.cancel(); rec = undefined; oncancel() }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
    else if (e.key === 'Enter') { e.preventDefault(); send() }
  }
  const fmt = (v: number) => `${Math.floor(v / 60000)}:${String(Math.floor((v % 60000) / 1000)).padStart(2, '0')}`
</script>

<svelte:window onkeydown={key} />
<div class="rec" role="group" aria-label="Voice message">
  <button class="icon-btn cancel" onclick={cancel} aria-label="Cancel recording" title="Cancel (Esc)"><Icon name="trash" /></button>
  <span class="dot" aria-hidden="true"></span>
  <span class="t mono" role="timer" aria-label="Recording time">{ready ? fmt(ms) : '…'}</span>
  <div class="meter" aria-hidden="true">{#each levels as v, i (i)}<i style="height:{Math.round(12 + v * 88)}%"></i>{/each}</div>
  <button class="send" onclick={send} disabled={!ready} aria-label="Send voice message" title="Send (Enter)"><Icon name="send" /></button>
  <span class="sr" role="status">{ready ? 'Recording' : 'Starting the microphone'}</span>
</div>

<style>
  .rec { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 2px 4px; }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #e5484d; animation: pulse 1.2s ease-in-out infinite; } @keyframes pulse { 50% { opacity: .35; } }
  .t { flex: none; min-width: 40px; font-size: 14px; font-variant-numeric: tabular-nums; }
  .meter { flex: 1; min-width: 0; height: 28px; display: flex; align-items: center; gap: 2px; } .meter i { flex: 1; min-width: 2px; border-radius: 2px; background: var(--accent); transition: height .08s linear; }
  .send { flex: none; width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); } .send:disabled { opacity: .5; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } .meter i { transition: none; } }
</style>
