<script lang="ts">
  import { originalOf } from './media'
  import type { EncryptedFile } from './attachments'
  import { exactSize, extensionOf, formatSize, kindOf, typeLabel } from './files'
  import Icon from './Icon.svelte'

  let { mxc, file, name, size, mimetype, sender, ts }: { mxc: string; file?: EncryptedFile; name: string; size?: number; mimetype?: string; sender?: string; ts?: number } = $props()
  let details = $state(false)

  let phase = $state<'idle' | 'busy' | 'done' | 'error'>('idle')
  const ext = $derived(extensionOf(name))
  const kind = $derived(kindOf(name, mimetype))
  const tone = $derived({ document: 3, archive: 1, code: 2, sheet: 5, video: 0, other: 4 }[kind])
  const label = $derived(typeLabel(name, mimetype))
  const detail = $derived([label || (ext ? ext.toUpperCase() : ''), formatSize(size)].filter(Boolean).join(' · '))
  const when = $derived(ts ? new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')

  /** Fetch the file (decrypted if it came from an encrypted room) and save it under its own name. It is only saved, never opened. */
  async function download() {
    if (phase === 'busy') return
    phase = 'busy'
    try {
      const blob = await originalOf(mxc, file, false)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.rel = 'noopener'
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      phase = 'done'
      setTimeout(() => phase === 'done' && (phase = 'idle'), 2500)
    } catch {
      phase = 'error'
    }
  }
</script>

<div class="file">
  <span class="tile" style="background:var(--t{tone})" aria-hidden="true">{#if ext}{ext.slice(0, 4)}{:else}<Icon name="file" size={20} />{/if}</span>
  <span class="info"><b title={name}>{name}</b><small>{#if file}<span class="lock" title="End-to-end encrypted"><Icon name="lock" size={11} /><span class="sr">Encrypted. </span></span>{/if}{detail}</small></span>
  <button class="more" onclick={() => (details = !details)} aria-expanded={details} aria-label="Details of {name}" title="Details"><Icon name="info" size={16} /></button>
  <button class="dl" onclick={download} disabled={phase === 'busy'} aria-label={phase === 'error' ? `Retry downloading ${name}` : `Download ${name}`}>
    {#if phase === 'busy'}<span class="spin" aria-hidden="true"></span>{:else if phase === 'done'}<Icon name="check" size={16} />{:else}<Icon name="download" size={16} />{/if}
    <span>{phase === 'busy' ? 'Downloading' : phase === 'done' ? 'Saved' : phase === 'error' ? 'Retry' : 'Download'}</span>
  </button>
</div>
{#if details}
  <dl class="meta" aria-label="Details of {name}">
    <dt>Name</dt><dd>{name}</dd>
    {#if label}<dt>Type</dt><dd>{label}{#if mimetype && mimetype !== label}{" "}<span class="mono">({mimetype})</span>{/if}</dd>{/if}
    {#if size !== undefined}<dt>Size</dt><dd>{formatSize(size)}{" "}<span class="mono">({exactSize(size)})</span></dd>{/if}
    {#if sender}<dt>Sent by</dt><dd>{sender}{#if when}, {when}{/if}</dd>{/if}
    <dt>Encryption</dt><dd>{file ? 'End-to-end encrypted: only people in the room can read it' : 'Not encrypted'}</dd>
  </dl>
{/if}
{#if phase === 'error'}<div class="err" role="alert">This file could not be downloaded.</div>{/if}

<style>
  .file { display: flex; align-items: center; gap: 12px; width: min(380px, 100%); margin-top: 4px; padding: 10px 10px 10px 10px; border-radius: 12px; background: var(--tile); border: 1px solid var(--line); }
  .tile { flex: none; width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; color: var(--ink); font: 700 12px/1 var(--mono, monospace); letter-spacing: .02em; }
  .info { flex: 1; min-width: 0; display: grid; gap: 2px; } .info b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; } .info small { color: var(--muted); font-size: 12px; }
  .dl { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); font-size: 13px; font-weight: 600; } .dl:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); } .dl:disabled { opacity: .7; }
  .more { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: var(--muted); } .more:hover, .more[aria-expanded=true] { background: var(--line); color: var(--text); }
  .lock { display: inline-flex; margin-right: 4px; vertical-align: -1px; color: var(--ok); } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .meta { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; width: min(380px, 100%); margin: 4px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); font-size: 12px; } .meta dt { color: var(--muted); } .meta dd { margin: 0; overflow-wrap: anywhere; }
  .err { color: var(--danger); font-size: 12px; margin: 4px 0 0 4px; }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  @media (max-width: 420px) { .dl span { display: none; } .dl { padding: 8px; } }
</style>
