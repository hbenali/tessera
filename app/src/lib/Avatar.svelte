<script lang="ts">
  import { initials, tone } from './ui.svelte'
  import { thumb } from './media'
  let { name, size = 36, round = false, src, presence }: { name: string; size?: number; round?: boolean; src?: string; presence?: 'online' | 'unavailable' | 'offline' } = $props()
  let url = $state<string>()
  $effect(() => {
    const mxc = src
    url = undefined
    if (!mxc) return
    let live = true
    thumb(mxc, size).then((u) => { if (live) url = u }, () => {})
    return () => { live = false }
  })
  const label = $derived(presence === 'online' ? 'Online' : presence === 'unavailable' ? 'Away' : presence === 'offline' ? 'Offline' : '')
</script>

<span class="wrap" style="--s:{size}px">
  <span class="av" class:round style="background:var(--t{tone(name)})" aria-hidden="true">{#if url}<img src={url} alt="" />{:else}{initials(name)}{/if}</span>
  {#if presence}<span class="dot {presence}" title={label}></span><span class="sr">{label}</span>{/if}
</span>

<style>
  .wrap { position: relative; flex: none; display: inline-block; width: var(--s); height: var(--s); }
  .av { width: 100%; height: 100%; border-radius: calc(var(--s) * .3); display: grid; place-items: center; overflow: hidden; color: var(--ink); font: 700 calc(var(--s) * .38)/1 var(--sans); letter-spacing: -.02em; user-select: none; }
  .av.round { border-radius: 50%; }
  img { width: 100%; height: 100%; object-fit: cover; }
  .dot { position: absolute; right: -2px; bottom: -2px; width: max(9px, calc(var(--s) * .3)); height: max(9px, calc(var(--s) * .3)); border-radius: 50%; border: 2px solid var(--panel); box-sizing: border-box; background: var(--muted); }
  .dot.online { background: var(--ok); } .dot.unavailable { background: #e0a100; } .dot.offline { background: var(--panel); border-color: var(--muted); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
