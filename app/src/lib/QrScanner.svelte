<script lang="ts">
  let { onscan }: { onscan: (bytes: Uint8ClampedArray) => void } = $props()
  let video: HTMLVideoElement | undefined = $state()
  let error = $state('')

  $effect(() => {
    const v = video
    if (!v) return
    let live = true
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const canvas = document.createElement('canvas')
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!live) return stream.getTracks().forEach((t) => t.stop())
        v.srcObject = stream
        await v.play()
        const { decode } = await import('./qr')
        const tick = () => {
          if (!live) return
          if (v.videoWidth) {
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            const g = canvas.getContext('2d', { willReadFrequently: true })!
            g.drawImage(v, 0, 0)
            const bytes = decode(g.getImageData(0, 0, canvas.width, canvas.height))
            if (bytes) return onscan(bytes)
          }
          timer = setTimeout(tick, 200)
        }
        tick()
      } catch (e) {
        error = e instanceof DOMException && e.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in your browser, or use a screenshot instead.' : 'No camera could be started. Use a screenshot instead.'
      }
    })()
    return () => { live = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  })
</script>

{#if error}<p class="err" role="alert">{error}</p>{:else}<video bind:this={video} muted playsinline aria-label="Camera view: point it at the code on your other device"></video>{/if}

<style>
  video { width: 100%; max-height: 260px; border-radius: 8px; background: #000; object-fit: cover; }
  .err { color: var(--danger); font-size: 13px; }
</style>
