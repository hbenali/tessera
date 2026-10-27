<script lang="ts">
  import { initials, tone } from './ui.svelte'
  import { chat } from './matrix.svelte'
  let { name, size = 36, round = false, src }: { name: string; size?: number; round?: boolean; src?: string } = $props()
  let url = $state<string>()
  $effect(() => {
    const mxc = src
    url = undefined
    if (!mxc) return
    let live = true
    chat.thumb(mxc, size).then((u) => { if (live) url = u }, () => {})
    return () => { live = false }
  })
</script>

<span class="av" class:round style="--s:{size}px;background:var(--t{tone(name)})" aria-hidden="true">{#if url}<img src={url} alt="" />{:else}{initials(name)}{/if}</span>

<style>
  .av { flex: none; width: var(--s); height: var(--s); border-radius: calc(var(--s) * .3); display: grid; place-items: center; overflow: hidden; color: var(--ink); font: 700 calc(var(--s) * .38)/1 var(--sans); letter-spacing: -.02em; user-select: none; }
  .av.round { border-radius: 50%; }
  img { width: 100%; height: 100%; object-fit: cover; }
</style>
