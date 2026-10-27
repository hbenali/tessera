<script lang="ts">
  import { thumb } from './media'
  let { mxc, alt, onopen }: { mxc: string; alt: string; onopen?: (opener: HTMLElement) => void } = $props()
  let url = $state<string>()
  let failed = $state(false)
  $effect(() => {
    const m = mxc
    url = undefined
    failed = false
    let live = true
    thumb(m, 320, 'scale').then((u) => { if (live) url = u }, () => { if (live) failed = true })
    return () => { live = false }
  })
</script>

{#if url}<button class="open" onclick={(e) => onopen?.(e.currentTarget)} aria-label="Open image: {alt}" aria-haspopup="dialog"><img src={url} alt="" /></button>{:else}<div class="ph" role="img" aria-label={alt}>{failed ? 'Image unavailable' : ''}</div>{/if}

<style>
  .open { display: block; padding: 0; margin-top: 4px; border-radius: 10px; cursor: zoom-in; } .open img { margin-top: 0; }
  img { display: block; max-width: min(100%, 480px); max-height: 360px; border-radius: 10px; margin-top: 4px; }
  .ph { width: 240px; height: 160px; border-radius: 10px; margin-top: 4px; background: var(--tile); display: grid; place-items: center; color: var(--muted); font-size: 12px; }
</style>
