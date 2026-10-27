<script lang="ts">
  let { bytes, label }: { bytes: Uint8ClampedArray; label: string } = $props()
  let canvas: HTMLCanvasElement | undefined = $state()
  // A QR code is dark on light whatever the theme, or phone cameras cannot read it.
  $effect(() => {
    const b = bytes
    const c = canvas
    if (!c) return
    let live = true
    import('./qr').then(({ modules }) => {
      if (!live) return
      const m = modules(b)
      const scale = 6, quiet = 4, size = (m.length + quiet * 2) * scale
      c.width = c.height = size
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, size, size)
      g.fillStyle = '#000'
      m.forEach((row, r) => row.forEach((dark, x) => dark && g.fillRect((x + quiet) * scale, (r + quiet) * scale, scale, scale)))
    })
    return () => { live = false }
  })
</script>

<div role="img" aria-label={label}><canvas bind:this={canvas} aria-hidden="true"></canvas></div>

<style>
  canvas { width: min(240px, 100%); height: auto; aspect-ratio: 1; image-rendering: pixelated; border-radius: 8px; background: #fff; display: block; margin: 0 auto; }
</style>
