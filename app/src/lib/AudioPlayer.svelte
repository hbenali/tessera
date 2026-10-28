<script lang="ts">
  import { originalOf } from './media'
  import type { EncryptedFile } from './attachments'
  import Icon from './Icon.svelte'

  let { mxc, file, duration, waveform, voice, name }: { mxc: string; file?: EncryptedFile; duration?: number; waveform?: number[]; voice: boolean; name: string } = $props()

  // Only one thing plays at a time, across every message.
  let audio: HTMLAudioElement | undefined
  const BARS = 44

  let src = $state<string>()
  let loading = $state(false)
  let failed = $state('')
  let playing = $state(false)
  let time = $state(0) // seconds
  let rate = $state(1)
  let measured = $state<number | undefined>() // read from the file once it is loaded
  const known = $derived(duration ? duration / 1000 : measured) // the message's own duration wins: a recording's file may not carry one
  const total = $derived(known && Number.isFinite(known) ? known : 0)

  const bars = $derived.by(() => {
    const w = waveform?.length ? waveform : null
    if (!w) return Array.from({ length: BARS }, (_, i) => 0.25 + 0.2 * Math.sin(i * 1.3) ** 2) // a calm placeholder shape
    return Array.from({ length: BARS }, (_, i) => {
      const from = Math.floor((i * w.length) / BARS)
      const to = Math.max(from + 1, Math.floor(((i + 1) * w.length) / BARS))
      return Math.max(0.12, Math.max(...w.slice(from, to)) / 1024)
    })
  })

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  async function ensure(): Promise<HTMLAudioElement | undefined> {
    if (audio && src) return audio
    loading = true
    failed = ''
    try {
      const blob = await originalOf(mxc, file)
      src = URL.createObjectURL(blob)
      audio = new Audio(src)
      audio.playbackRate = rate
      audio.addEventListener('timeupdate', () => (time = audio!.currentTime))
      audio.addEventListener('ended', () => { playing = false; time = 0; audio!.currentTime = 0 })
      audio.addEventListener('pause', () => (playing = false))
      audio.addEventListener('play', () => (playing = true))
      audio.addEventListener('loadedmetadata', () => { if (!duration && Number.isFinite(audio!.duration)) measured = audio!.duration })
      return audio
    } catch {
      failed = 'This audio could not be loaded.'
    } finally {
      loading = false
    }
  }
  async function toggle() {
    const a = await ensure()
    if (!a) return
    if (a.paused) {
      // stop whatever else is playing
      window.dispatchEvent(new CustomEvent('tessera:play', { detail: a }))
      await a.play().catch(() => (failed = 'This browser could not play the audio.'))
    } else a.pause()
  }
  $effect(() => {
    const stop = (e: Event) => { if ((e as CustomEvent).detail !== audio && audio && !audio.paused) audio.pause() }
    window.addEventListener('tessera:play', stop)
    return () => { window.removeEventListener('tessera:play', stop); audio?.pause(); if (src) URL.revokeObjectURL(src) }
  })

  async function seek(to: number) {
    const a = await ensure()
    if (!a || !total) return
    a.currentTime = Math.max(0, Math.min(total, to))
    time = a.currentTime
  }
  function onBars(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    seek(((e.clientX - r.left) / r.width) * total)
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); seek(time + 5) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(time - 5) }
    else if (e.key === 'Home') { e.preventDefault(); seek(0) }
  }
  const SPEEDS = [1, 1.5, 2]
  function faster() {
    rate = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length]
    if (audio) audio.playbackRate = rate
  }
  const progress = $derived(total ? Math.min(1, time / total) : 0)
</script>

<div class="player" class:voice>
  <button class="play" onclick={toggle} aria-label={playing ? 'Pause' : voice ? 'Play voice message' : `Play ${name}`} disabled={loading}>
    {#if loading}<span class="spin" aria-hidden="true"></span>{:else}<Icon name={playing ? 'pause' : 'play'} size={18} />{/if}
  </button>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="wave" role="slider" tabindex="0" aria-label="Position" aria-valuemin="0" aria-valuemax={Math.round(total)} aria-valuenow={Math.round(time)} aria-valuetext="{fmt(time)} of {fmt(total)}" onclick={onBars} onkeydown={key}>
    {#each bars as h, i (i)}<i class:done={(i + 0.5) / BARS <= progress} style="height:{Math.round(h * 100)}%"></i>{/each}
  </div>
  <span class="time mono">{playing || time > 0 ? fmt(time) : total ? fmt(total) : ''}</span>
  <button class="speed" onclick={faster} aria-label="Playback speed, now {rate} times. Change" title="Playback speed">{rate}×</button>
</div>
{#if !voice}<div class="cap">{name}</div>{/if}
{#if failed}<div class="err" role="alert">{failed}</div>{/if}

<style>
  .player { display: flex; align-items: center; gap: 10px; width: min(340px, 100%); margin-top: 4px; padding: 8px 12px 8px 8px; border-radius: 22px; background: var(--tile); }
  .play { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); } .play:disabled { opacity: .7; }
  .wave { flex: 1; min-width: 0; height: 32px; display: flex; align-items: center; gap: 2px; cursor: pointer; border-radius: 6px; } .wave:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .wave i { flex: 1; min-width: 2px; border-radius: 2px; background: var(--muted); opacity: .45; } .wave i.done { background: var(--accent); opacity: 1; }
  .time { flex: none; min-width: 34px; font-size: 12px; color: var(--muted); text-align: right; }
  .speed { flex: none; font-size: 11px; font-weight: 700; color: var(--muted); padding: 3px 6px; border-radius: 6px; } .speed:hover { background: var(--line); color: var(--text); }
  .cap { font-size: 12px; color: var(--muted); margin: 2px 0 0 4px; } .err { color: var(--danger); font-size: 12px; margin: 4px 0 0 4px; }
  .spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
