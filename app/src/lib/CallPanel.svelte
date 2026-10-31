<script lang="ts">
  import { chat } from './matrix.svelte'
  import { calls } from './calls.svelte'
  import { clock, phaseLabel } from './callstate'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'

  const c = $derived(calls.active)
  const name = $derived(c ? (chat.nameOf(c.peer) ?? c.peer) : '')
  let now = $state(Date.now())
  $effect(() => { if (c?.startedAt) { const i = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(i) } })
  const stream = (node: HTMLMediaElement, s: MediaStream | null) => { node.srcObject = s; return { update(n: MediaStream | null) { node.srcObject = n }, destroy() { node.srcObject = null } } }
</script>

{#if c}
  <div class="call" role="dialog" aria-label="Call with {name}" class:ringing={c.phase === 'ringing'}>
    {#if c.video && calls.remote && c.phase === 'connected'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="remote" autoplay playsinline use:stream={calls.remote}></video>
    {:else}
      <div class="who"><Avatar {name} size={72} round /></div>
    {/if}
    {#if calls.remote && !(c.video && c.phase === 'connected')}<audio autoplay use:stream={calls.remote}></audio>{/if}
    {#if c.video && calls.local && c.phase !== 'ringing'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="local" autoplay playsinline muted use:stream={calls.local}></video>
    {/if}
    <div class="bar">
      <div class="status" role="status" aria-live="polite"><b>{name}</b><span>{c.note || phaseLabel(c.phase, c.video, name)}{c.startedAt && c.phase === 'connected' ? ` · ${clock((now - c.startedAt) / 1000)}` : ''}</span></div>
      <div class="btns">
        {#if c.phase === 'ringing'}
          <button class="btn ok" onclick={() => calls.answer(false)}><Icon name="phone" size={16} /> Answer</button>
          {#if c.video}<button class="btn ok" onclick={() => calls.answer(true)}><Icon name="video" size={16} /> Answer with video</button>{/if}
          <button class="btn danger" onclick={() => calls.hangup()}><Icon name="phoneOff" size={16} /> Decline</button>
        {:else if c.phase !== 'ended'}
          <button class="round" aria-pressed={c.micMuted} aria-label={c.micMuted ? 'Unmute microphone' : 'Mute microphone'} onclick={() => calls.toggleMic()}><Icon name={c.micMuted ? 'micOff' : 'mic'} size={18} /></button>
          {#if c.video}<button class="round" aria-pressed={c.camOff} aria-label={c.camOff ? 'Turn camera on' : 'Turn camera off'} onclick={() => calls.toggleCamera()}><Icon name={c.camOff ? 'videoOff' : 'video'} size={18} /></button>{/if}
          <button class="round hang" aria-label="Hang up" onclick={() => calls.hangup()}><Icon name="phoneOff" size={18} /></button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .call { position: fixed; z-index: 40; right: 16px; bottom: 16px; width: min(380px, calc(100vw - 32px)); min-height: 200px; display: grid; background: #12141a; color: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgb(0 0 0 / .45); }
  .ringing { outline: 2px solid var(--accent); animation: pulse 1.6s infinite; } @media (prefers-reduced-motion: reduce) { .ringing { animation: none; } }
  @keyframes pulse { 50% { outline-color: transparent; } }
  .remote { width: 100%; max-height: 300px; background: #000; object-fit: cover; } .who { display: grid; place-items: center; padding: 28px 0 8px; }
  .local { position: absolute; top: 10px; right: 10px; width: 96px; border-radius: 8px; background: #000; box-shadow: 0 0 0 1px rgb(255 255 255 / .3); transform: scaleX(-1); }
  .bar { display: grid; gap: 10px; padding: 12px 14px 14px; } .status { display: grid; } .status span { color: #c4c9d4; font-size: 13px; }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; color: #fff; } .ok { background: #2e8b57; } .danger, .hang { background: #c0392b; }
  .round { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: #2a2e38; color: #fff; } .round[aria-pressed=true] { background: #fff; color: #12141a; } .hang { color: #fff; }
</style>
