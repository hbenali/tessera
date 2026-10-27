<script lang="ts">
  import { chat } from './matrix.svelte'
  let { mxc, alt }: { mxc: string; alt: string } = $props()
  let url = $state<string>()
  let failed = $state(false)
  $effect(() => {
    const m = mxc
    url = undefined
    failed = false
    let live = true
    chat.thumb(m, 320, 'scale').then((u) => { if (live) url = u }, () => { if (live) failed = true })
    return () => { live = false }
  })
</script>

{#if url}<img src={url} {alt} />{:else}<div class="ph" role="img" aria-label={alt}>{failed ? 'Image unavailable' : ''}</div>{/if}

<style>
  img { display: block; max-width: min(100%, 480px); max-height: 360px; border-radius: 10px; margin-top: 4px; }
  .ph { width: 240px; height: 160px; border-radius: 10px; margin-top: 4px; background: var(--tile); display: grid; place-items: center; color: var(--muted); font-size: 12px; }
</style>
