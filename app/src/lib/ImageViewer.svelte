<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import { originalOf, thumb } from './media'
  import Icon from './Icon.svelte'

  const opener = ui.viewer!.opener
  let id = $state(ui.viewer!.id)
  // Every image in the open room, oldest first, so Previous and Next walk through them.
  const images = $derived(chat.messages.filter((m) => m.imageMxc))
  const at = $derived(images.findIndex((m) => m.id === id))
  const cur = $derived(images[at])

  let src = $state<string>()
  let preview = $state<string>()
  let error = $state('')
  let blob: Blob | undefined
  // Pan and zoom: scale 1 is "fit the window"; x and y move the picture.
  let scale = $state(1)
  let x = $state(0)
  let y = $state(0)
  let dragging = $state(false)
  let stage: HTMLElement | undefined = $state()
  let dialog: HTMLElement | undefined = $state()

  $effect(() => {
    const m = cur
    if (!m?.imageMxc) return
    scale = 1; x = 0; y = 0; src = undefined; preview = undefined; error = ''; blob = undefined
    let live = true
    let made: string | undefined
    thumb(m.imageMxc, 320, 'scale').then((u) => { if (live && !src) preview = u }, () => {})
    originalOf(m.imageMxc, m.imageFile).then(
      (b) => { if (!live) return; blob = b; made = URL.createObjectURL(b); src = made },
      () => { if (live) error = 'This image could not be loaded.' },
    )
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  })
  // The picture that was open can disappear (deleted); close rather than show nothing.
  $effect(() => { if (at < 0) close() })

  const MIN = 1, MAX = 8
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  function zoomTo(next: number, cx = 0, cy = 0) {
    const s = clamp(next, MIN, MAX)
    // Keep the point under the cursor still while zooming.
    x = cx - ((cx - x) * s) / scale
    y = cy - ((cy - y) * s) / scale
    scale = s
    if (s === 1) { x = 0; y = 0 }
  }
  const centreOf = (e: { clientX: number; clientY: number }) => {
    const r = stage!.getBoundingClientRect()
    return [e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)] as const
  }
  function wheel(e: WheelEvent) {
    e.preventDefault()
    const [cx, cy] = centreOf(e)
    zoomTo(scale * Math.exp(-e.deltaY * 0.0015), cx, cy)
  }
  function dbl(e: MouseEvent) {
    const [cx, cy] = centreOf(e)
    zoomTo(scale > 1 ? 1 : 2.5, cx, cy)
  }

  // Dragging pans a zoomed picture; two fingers pinch.
  const pointers = new Map<number, { x: number; y: number }>()
  let pinch = 0
  function down(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) }
    dragging = scale > 1
  }
  function move(e: PointerEvent) {
    const p = pointers.get(e.pointerId)
    if (!p) return
    if (pointers.size === 2) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) { const [cx, cy] = centreOf({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }); zoomTo(scale * (d / pinch), cx, cy) }
      pinch = d
    } else if (scale > 1) {
      x += e.clientX - p.x
      y += e.clientY - p.y
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
  }
  function up(e: PointerEvent) { pointers.delete(e.pointerId); pinch = 0; dragging = false }

  function step(by: number) {
    const n = images[at + by]
    if (n) id = n.id
  }
  function close() {
    ui.viewer = null
    opener?.focus()
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(scale * 1.4) }
    else if (e.key === '-') { e.preventDefault(); zoomTo(scale / 1.4) }
    else if (e.key === '0') { e.preventDefault(); zoomTo(1) }
    else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const f = [...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])]
      if (!f.length) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus()
    }
  }
  $effect(() => { dialog?.querySelector<HTMLElement>('.close')?.focus() })

  // Name the file after the message when it looks like a file name, otherwise "image" plus the right extension.
  function fileName(): string {
    const body = cur?.body ?? ''
    if (/^[^/\\]+\.[A-Za-z0-9]{2,5}$/.test(body)) return body
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' } as Record<string, string>)[blob?.type ?? ''] ?? 'img'
    return `image.${ext}`
  }
  function download() {
    if (!src) return
    const a = document.createElement('a')
    a.href = src
    a.download = fileName()
    document.body.append(a)
    a.click()
    a.remove()
  }

  const when = $derived(cur ? new Date(cur.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
</script>

{#if cur}
  <div class="viewer" role="dialog" aria-modal="true" aria-label="Image viewer" tabindex="-1" bind:this={dialog} onkeydown={key}>
    <header>
      <div class="who"><b>{cur.senderName}</b><span>{when}{images.length > 1 ? ` · ${at + 1} of ${images.length}` : ''}</span></div>
      <div class="tools">
        <button onclick={() => zoomTo(scale / 1.4)} disabled={scale <= MIN} aria-label="Zoom out" title="Zoom out (-)"><Icon name="zoomOut" size={18} /></button>
        <button class="pct" onclick={() => zoomTo(1)} disabled={scale === 1} aria-label="Fit to window, now {Math.round(scale * 100)} percent" title="Fit to window (0)">{Math.round(scale * 100)}%</button>
        <button onclick={() => zoomTo(scale * 1.4)} disabled={scale >= MAX} aria-label="Zoom in" title="Zoom in (+)"><Icon name="zoomIn" size={18} /></button>
        <button onclick={download} disabled={!src} aria-label="Download image" title="Download"><Icon name="download" size={18} /></button>
        <button class="close" onclick={close} aria-label="Close viewer" title="Close (Esc)"><Icon name="x" size={18} /></button>
      </div>
    </header>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="stage" bind:this={stage} onwheel={wheel} ondblclick={dbl} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} class:zoomed={scale > 1} class:dragging>
      {#if error}
        <p class="err" role="alert">{error}</p>
      {:else if src || preview}
        <img src={src ?? preview} alt={cur.body} class:soft={!src} style="transform: translate({x}px, {y}px) scale({scale})" draggable="false" />
        {#if !src}<span class="loading" role="status">Loading…</span>{/if}
      {/if}
    </div>

    {#if at > 0}<button class="nav prev" onclick={() => step(-1)} aria-label="Previous image"><Icon name="back" size={22} /></button>{/if}
    {#if at < images.length - 1}<button class="nav next" onclick={() => step(1)} aria-label="Next image"><span class="flip"><Icon name="back" size={22} /></span></button>{/if}
    <p class="sr" role="status">Zoom {Math.round(scale * 100)} percent</p>
  </div>
{/if}

<style>
  .viewer { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; background: rgb(8 9 12 / .97); color: #fff; outline: none; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; flex: none; background: linear-gradient(rgb(0 0 0 / .5), transparent); z-index: 2; }
  .who { display: grid; min-width: 0; } .who b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .who span { font-size: 12px; color: #c4c8d2; }
  .tools { display: flex; gap: 4px; flex: none; }
  button { color: #fff; border-radius: 8px; } .tools button { min-width: 36px; height: 36px; display: inline-grid; place-items: center; padding: 0 8px; background: rgb(255 255 255 / .1); } .tools button:hover:not(:disabled), .nav:hover { background: rgb(255 255 255 / .22); } .tools button:disabled { opacity: .4; cursor: default; }
  .pct { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 52px !important; }
  button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; touch-action: none; cursor: zoom-in; } .stage.zoomed { cursor: grab; } .stage.dragging { cursor: grabbing; }
  .stage img { max-width: 100%; max-height: calc(100dvh - 68px); object-fit: contain; user-select: none; -webkit-user-drag: none; will-change: transform; transition: transform .08s ease-out; } .stage.dragging img { transition: none; } .soft { filter: blur(2px); }
  .loading { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); padding: 4px 12px; border-radius: 999px; background: rgb(0 0 0 / .6); font-size: 12px; }
  .err { color: #ffb3a6; }
  .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 64px; display: grid; place-items: center; background: rgb(255 255 255 / .1); z-index: 2; } .prev { left: 10px; } .next { right: 10px; } .flip { display: inline-flex; transform: scaleX(-1); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { .stage img { transition: none; } }
</style>
