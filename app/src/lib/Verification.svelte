<script lang="ts">
  import Modal from './Modal.svelte'
  import QrCode from './QrCode.svelte'
  import QrScanner from './QrScanner.svelte'
  import { security } from './security.svelte'
  import { VerificationPhase as P } from 'matrix-js-sdk/lib/crypto-api/verification'

  let camera = $state(false)
  let file: HTMLInputElement | undefined = $state()
  $effect(() => { if (security.phase !== P.Ready) camera = false })

  async function fromImage() {
    const f = file?.files?.[0]
    if (file) file.value = ''
    if (!f) return
    try {
      const bmp = await createImageBitmap(f)
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.drawImage(bmp, 0, 0)
      const { decode } = await import('./qr')
      const bytes = decode(g.getImageData(0, 0, c.width, c.height))
      if (bytes) await security.scan(bytes)
      else security.scanError = 'No QR code was found in that image.'
    } catch {
      security.scanError = 'That file could not be read as an image.'
    }
  }
</script>

{#if security.request}
  <Modal title="Verify session" onclose={() => security.cancel()}>
    {#if security.sas}
      <p>Check that these symbols match on your other device.</p>
      <div class="emoji">{#each security.sas.emoji as [e, n] (n)}<div><span>{e}</span><small class="mono">{n}</small></div>{/each}</div>
      <div class="row"><button class="btn" onclick={() => security.sas?.confirm()}>They match</button><button class="btn ghost" onclick={() => security.sas?.mismatch()}>They do not</button></div>
    {:else if security.reciprocate}
      <p>Your other device scanned this code. Does it say the scan worked?</p>
      <div class="row"><button class="btn" onclick={() => security.reciprocate?.confirm()}>Yes, it did</button><button class="btn ghost" onclick={() => security.reciprocate?.cancel()}>No</button></div>
    {:else if security.phase === P.Requested && !security.request.initiatedByMe}
      <p>Another session is asking to verify.</p>
      <div class="row"><button class="btn" onclick={() => security.accept()}>Accept</button><button class="btn ghost" onclick={() => security.cancel()}>Decline</button></div>
    {:else if security.phase === P.Ready}
      {#if security.qr}
        <p>Scan this code with your other device.</p>
        <QrCode bytes={security.qr} label="QR code to scan with your other device" />
        <p class="or">Or scan the code it shows</p>
      {:else}
        <p>Choose how to verify.</p>
      {/if}
      {#if camera}<QrScanner onscan={(b) => { camera = false; security.scan(b) }} />{/if}
      <div class="row wrap">
        <button class="btn ghost" onclick={() => (camera = !camera)} aria-pressed={camera}>{camera ? 'Stop camera' : 'Scan with camera'}</button>
        <input type="file" accept="image/*" hidden bind:this={file} onchange={fromImage} />
        <button class="btn ghost" onclick={() => file?.click()}>Use a screenshot</button>
        <button class="btn ghost" onclick={() => security.startEmoji()}>Compare emoji instead</button>
      </div>
      {#if security.scanError}<p class="err" role="alert">{security.scanError}</p>{/if}
    {:else if security.phase === P.Done}
      <p>Verified.</p><button class="btn" onclick={() => security.dismiss()}>Done</button>
    {:else if security.phase === P.Cancelled}
      <p>Verification was cancelled{#if security.request.cancellationCode} <span class="mono">({security.request.cancellationCode})</span>{/if}.</p><button class="btn" onclick={() => security.dismiss()}>Close</button>
    {:else}
      <p>Waiting for the other device. Open another client and accept the request.</p>
    {/if}
  </Modal>
{/if}

<style>
  .emoji { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 8px; text-align: center; margin: 18px 0 22px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 16px 0; }
  .emoji span { font-size: 30px; display: block; } small { color: var(--muted); }
  .row { display: flex; gap: 10px; } .wrap { flex-wrap: wrap; margin-top: 12px; }
  .or { text-align: center; color: var(--muted); font-size: 13px; }
  .err { color: var(--danger); font-size: 13px; }
</style>
