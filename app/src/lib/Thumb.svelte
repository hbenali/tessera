<script lang="ts">
  import { originalOf, thumb } from './media'
  import type { EncryptedFile } from './attachments'
  // A square picture that loads only when it scrolls into view (a long room can hold hundreds).
  let { mxc, file, size = 96, alt = '' }: { mxc: string; file?: EncryptedFile; size?: number; alt?: string } = $props()
  let url = $state<string>()
  let failed = $state(false)
  let seen = $state(false)
  let box: HTMLElement | undefined = $state()
  $effect(() => {
    const el = box
    if (!el || seen) return
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { seen = true; io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  })
  $effect(() => {
    const m = mxc
    if (!seen) return
    url = undefined
    failed = false
    let live = true
    let made: string | undefined
    // An encrypted picture cannot be resized by the server: it is downloaded and decrypted here, and not kept.
    const shown = file ? originalOf(m, file, false).then((b) => (made = URL.createObjectURL(b))) : thumb(m, size * 2, 'crop')
    shown.then((u) => { if (live) url = u; else if (made) URL.revokeObjectURL(made) }, () => { if (live) failed = true })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  })
</script>

<span class="t" bind:this={box} style="--s:{size}px">{#if url}<img src={url} {alt} loading="lazy" draggable="false" />{:else if failed}<span class="x" role="img" aria-label="Unavailable">!</span>{/if}</span>

<style>
  .t { display: block; width: 100%; aspect-ratio: 1; background: var(--tile); overflow: hidden; border-radius: inherit; }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .x { display: grid; place-items: center; height: 100%; color: var(--muted); }
</style>
