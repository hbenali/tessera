<script lang="ts">
  import { chat } from './matrix.svelte'
  import type { Msg } from './matrix.svelte'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'
  import Avatar from './Avatar.svelte'

  let { m }: { m: Msg } = $props()
  let open = $state(false)
  let dialog = $state<null | 'forward' | 'source' | 'report' | 'remove'>(null)
  let term = $state('')
  let reason = $state('')
  let err = $state('')
  let done = $state('')
  let source = $state('')
  const targets = $derived(chat.rooms.filter((r) => !r.isSpace && !r.invited && r.id !== chat.activeRoom && r.name.toLowerCase().includes(term.trim().toLowerCase())).slice(0, 30))
  const others = $derived(!m.mine && chat.mayRemoveOthers())

  function show(d: NonNullable<typeof dialog>) {
    open = false; err = ''; done = ''; reason = ''; term = ''
    if (d === 'source') source = chat.sourceOf(m.id)
    dialog = d
  }
  async function run(f: () => Promise<unknown>, ok: string) {
    err = ''
    try { await f(); done = ok } catch (e) { err = e instanceof Error ? e.message : 'That did not work' }
  }
  const copySource = () => navigator.clipboard.writeText(source).then(() => (done = 'Copied'), () => (err = 'Could not copy'))
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') { open = false; e.stopPropagation() } }} />

<span class="mw">
  <button class="icon-btn" onclick={() => (open = !open)} aria-label="More actions" aria-haspopup="menu" aria-expanded={open}><Icon name="more" size={16} /></button>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="away" onclick={() => (open = false)}></div>
    <div class="menu" role="menu" aria-label="More actions for this message">
      <button role="menuitem" onclick={() => show('forward')}><Icon name="send" size={14} />Forward</button>
      <button role="menuitem" onclick={() => show('source')}><Icon name="info" size={14} />View source</button>
      {#if !m.mine}<button role="menuitem" onclick={() => show('report')}><Icon name="alert" size={14} />Report</button>{/if}
      {#if others}<button role="menuitem" onclick={() => show('remove')}><Icon name="trash" size={14} />Remove for everyone</button>{/if}
    </div>
  {/if}
</span>

{#if dialog === 'forward'}
  <Modal title="Forward message" onclose={() => (dialog = null)}>
    <p class="quote">{m.body.slice(0, 160) || 'Attachment'}</p>
    <input class="field" placeholder="Find a room" aria-label="Find a room" bind:value={term} />
    <ul class="pick">
      {#each targets as r (r.id)}
        <li><Avatar name={r.name} size={26} round={r.isDM} src={r.avatar} /><span class="n">{r.name}</span>
          <button class="btn ghost sm" onclick={() => run(() => chat.forwardMessage(m.id, r.id), `Forwarded to ${r.name}`)}>Send</button></li>
      {:else}<li class="empty">No matching room</li>{/each}
    </ul>
    {#if err}<p class="err" role="alert">{err}</p>{:else if done}<p class="ok" role="status">{done}</p>{/if}
  </Modal>
{:else if dialog === 'source'}
  <Modal title="Message source" onclose={() => (dialog = null)}>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="src mono" tabindex="0" aria-label="Event JSON">{source}</pre>
    <div class="row"><button class="btn" onclick={copySource}>Copy</button></div>
    {#if err}<p class="err" role="alert">{err}</p>{:else if done}<p class="ok" role="status">{done}</p>{/if}
  </Modal>
{:else if dialog === 'report' || dialog === 'remove'}
  <Modal title={dialog === 'report' ? 'Report message' : 'Remove message'} onclose={() => (dialog = null)}>
    <p class="quote">{m.senderName}: {m.body.slice(0, 160) || 'Attachment'}</p>
    <p class="hint">{dialog === 'report' ? 'This goes to your homeserver administrators, not to the room. They cannot read it if the room is encrypted unless you tell them why.' : 'It disappears for everyone in the room.'}</p>
    <label class="lbl">{dialog === 'report' ? 'What is wrong with it?' : 'Reason (optional)'}<textarea bind:value={reason} rows="3" maxlength="500"></textarea></label>
    {#if err}<p class="err" role="alert">{err}</p>{:else if done}<p class="ok" role="status">{done}</p>{/if}
    <div class="row">
      {#if dialog === 'report'}
        <button class="btn danger" disabled={!reason.trim() || !!done} onclick={() => run(() => chat.reportEvent(m.id, reason), 'Reported')}>Send report</button>
      {:else}
        <button class="btn danger" disabled={!!done} onclick={() => run(() => chat.removeMessage(m.id, reason), 'Removed')}>Remove</button>
      {/if}
      <button class="btn ghost" onclick={() => (dialog = null)}>{done ? 'Close' : 'Cancel'}</button>
    </div>
  </Modal>
{/if}

<style>
  .mw { position: relative; display: inline-flex; }
  .away { position: fixed; inset: 0; z-index: 14; }
  .menu { position: absolute; z-index: 15; right: 0; top: calc(100% + 4px); min-width: 190px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 6px; text-align: left; white-space: nowrap; } .menu button:hover { background: var(--tile); }
  .quote { margin: 0 0 10px; padding: 8px 10px; border-left: 3px solid var(--line); background: var(--tile); border-radius: 6px; color: var(--muted); overflow-wrap: anywhere; }
  .field, .lbl textarea { width: 100%; box-sizing: border-box; font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .pick { list-style: none; margin: 8px 0 0; padding: 0; max-height: 280px; overflow: auto; } .pick li { display: flex; align-items: center; gap: 10px; padding: 5px 0; } .n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .empty { color: var(--muted); }
  .src { max-height: 50vh; overflow: auto; margin: 0 0 12px; padding: 10px; background: var(--tile); border-radius: 8px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .lbl { display: grid; gap: 4px; font-size: 12px; color: var(--muted); } .hint { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
  .row { display: flex; gap: 8px; margin-top: 12px; } .sm { padding: 3px 10px; }
  .ok { color: var(--ok); font-size: 13px; margin: 8px 0 0; } .err { color: var(--danger); font-size: 13px; margin: 8px 0 0; } .btn.danger { background: var(--danger); color: var(--bg); }
</style>
