<script lang="ts">
  import { chat } from './matrix.svelte'
  let pass = $state('')
  let again = $state('')
  let err = $state('')
  let msg = $state('')
  let busy = $state(false)
  let file: HTMLInputElement | undefined = $state()
  let ipass = $state('')
  let chosen = $state<File | null>(null)

  async function exportIt(e: Event) {
    e.preventDefault(); err = ''; msg = ''; busy = true
    try {
      const text = await chat.exportKeys(pass)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
      a.download = 'tessera-room-keys.txt'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      msg = 'Keys saved to a file. Keep it and its passphrase safe: together they can read your encrypted messages.'
      pass = again = ''
    } catch (x) { err = x instanceof Error ? x.message : 'Could not export' }
    busy = false
  }
  async function importIt(e: Event) {
    e.preventDefault(); err = ''; msg = ''
    if (!chosen) return
    busy = true
    try { await chat.importKeys(await chosen.text(), ipass); msg = 'Keys imported. Older encrypted messages can now be read.'; ipass = ''; chosen = null; if (file) file.value = '' } catch (x) { err = x instanceof Error ? x.message : 'Could not import' }
    busy = false
  }
</script>

<h3 class="label">Export room keys</h3>
<p class="hint">Saves the keys of your encrypted rooms to a file, locked with a passphrase, so you can read them in another client (Element uses the same format).</p>
<form onsubmit={exportIt}>
  <input type="password" aria-label="Passphrase" placeholder="Passphrase" bind:value={pass} autocomplete="new-password" minlength="8" />
  <input type="password" aria-label="Repeat the passphrase" placeholder="Repeat the passphrase" bind:value={again} autocomplete="new-password" />
  <button class="btn" disabled={busy || pass.length < 8 || pass !== again}>Export</button>
</form>
<h3 class="label">Import room keys</h3>
<form onsubmit={importIt}>
  <input type="file" aria-label="Key file" accept=".txt,text/plain" bind:this={file} onchange={() => (chosen = file?.files?.[0] ?? null)} />
  <input type="password" aria-label="File passphrase" placeholder="The file's passphrase" bind:value={ipass} autocomplete="off" />
  <button class="btn" disabled={busy || !chosen || !ipass}>Import</button>
</form>
{#if err}<p class="e" role="alert">{err}</p>{:else if msg}<p class="o" role="status">{msg}</p>{/if}

<style>
  form { display: grid; gap: 8px; } input:not([type=file]) { font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; }
  .hint { color: var(--muted); font-size: 12px; margin: 2px 0 8px; } .e { color: var(--danger); font-size: 13px; } .o { color: var(--ok); font-size: 13px; }
</style>
