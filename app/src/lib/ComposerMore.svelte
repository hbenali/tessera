<script lang="ts">
  import { chat } from './matrix.svelte'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'
  let { onfiles }: { onfiles: () => void } = $props()
  let open = $state(false)
  let dialog = $state<null | 'poll' | 'location'>(null)
  let question = $state('')
  let answers = $state(['', ''])
  let disclosed = $state(true)
  let multi = $state(false)
  let err = $state('')
  let busy = $state(false)
  let pos = $state<{ lat: number; lon: number; acc: number } | null>(null)
  const filled = $derived(answers.map((a) => a.trim()).filter(Boolean))
  const ok = $derived(question.trim().length > 0 && filled.length >= 2)

  async function makePoll(e: Event) {
    e.preventDefault(); err = ''; busy = true
    try { await chat.createPoll(question, filled, disclosed, multi ? filled.length : 1); dialog = null; question = ''; answers = ['', ''] } catch (x) { err = x instanceof Error ? x.message : 'Could not create the poll' }
    busy = false
  }
  function locate() {
    dialog = 'location'; err = ''; pos = null
    if (!navigator.geolocation) { err = 'This browser cannot tell where you are'; return }
    navigator.geolocation.getCurrentPosition((p) => (pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }), (x) => (err = x.code === 1 ? 'Location is blocked. Allow it for this site in the browser, then try again.' : 'Could not find your location'), { enableHighAccuracy: true, timeout: 15000 })
  }
  async function share() {
    if (!pos) return
    busy = true
    try { await chat.sendLocation(pos.lat, pos.lon, pos.acc); dialog = null } catch (x) { err = x instanceof Error ? x.message : 'Could not send' }
    busy = false
  }
  const pickItem = (f: () => void) => { open = false; f() }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') { open = false; e.stopPropagation() } }} />
<span class="cw">
  <button class="icon-btn" title="Attach or share" aria-label="Attach or share" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}><Icon name="plus" /></button>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="away" onclick={() => (open = false)}></div>
    <div class="menu" role="menu" aria-label="Attach or share">
      <button role="menuitem" onclick={() => pickItem(onfiles)}><Icon name="clip" size={14} />Files</button>
      <button role="menuitem" onclick={() => pickItem(() => (dialog = 'poll'))}><Icon name="checks" size={14} />Poll</button>
      <button role="menuitem" onclick={() => pickItem(locate)}><Icon name="pin" size={14} />My location</button>
    </div>
  {/if}
</span>

{#if dialog === 'poll'}
  <Modal title="Create a poll" onclose={() => (dialog = null)}>
    <form onsubmit={makePoll}>
      <label>Question<input bind:value={question} maxlength="200" required /></label>
      {#each answers as _, i (i)}
        <label>Answer {i + 1}<input bind:value={answers[i]} maxlength="100" /></label>
      {/each}
      {#if answers.length < 10}<button type="button" class="btn ghost" onclick={() => (answers = [...answers, ''])}>Add an answer</button>{/if}
      <label class="chk"><input type="checkbox" bind:checked={multi} /> Allow several answers</label>
      <label class="chk"><input type="checkbox" checked={!disclosed} onchange={(e) => (disclosed = !e.currentTarget.checked)} /> Hide results until the poll ends</label>
      {#if err}<p class="err" role="alert">{err}</p>{/if}
      <button class="btn" disabled={!ok || busy}>Create poll</button>
    </form>
  </Modal>
{:else if dialog === 'location'}
  <Modal title="Share your location" onclose={() => (dialog = null)}>
    {#if pos}<p>Your position, to about {Math.round(pos.acc)} m: <span class="mono">{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}</span></p><p class="hint">Everyone in the room will see it{chat.active?.encrypted ? '' : ', and the homeserver can too (this room is not encrypted)'}.</p>{:else if !err}<p>Finding you…</p>{/if}
    {#if err}<p class="err" role="alert">{err}</p>{/if}
    <button class="btn" disabled={!pos || busy} onclick={share}>Send my location</button>
  </Modal>
{/if}

<style>
  .cw { position: relative; display: inline-flex; } .away { position: fixed; inset: 0; z-index: 14; }
  .menu { position: absolute; z-index: 15; left: 0; bottom: calc(100% + 6px); min-width: 170px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 6px; text-align: left; } .menu button:hover { background: var(--tile); }
  form { display: grid; gap: 10px; } label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); } input:not([type=checkbox]) { font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; }
  .chk { display: flex; align-items: center; gap: 8px; } .err { color: var(--danger); font-size: 13px; margin: 0; } .hint { color: var(--muted); font-size: 12px; }
</style>
