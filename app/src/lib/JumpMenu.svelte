<script lang="ts">
  import { chat } from './matrix.svelte'
  import { startOfDay } from './jump'
  import Icon from './Icon.svelte'
  let open = $state(false)
  let day = $state('')
  let msg = $state('')
  const today = new Date().toISOString().slice(0, 10)
  async function unread() {
    msg = ''
    try { if ((await chat.jumpToFirstUnread()) === 'none') msg = 'You have read everything here'; else open = false } catch (e) { msg = e instanceof Error ? e.message : 'Could not jump' }
  }
  async function date(e: Event) {
    e.preventDefault(); msg = ''
    const t = startOfDay(day)
    if (t === undefined) { msg = 'Choose a date'; return }
    try { await chat.jumpToDate(t); open = false } catch (x) { msg = /M_NOT_FOUND|not found/i.test(String(x)) ? 'No messages on or after that date' : x instanceof Error ? x.message : 'Could not jump' }
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') open = false }} />
<span class="jw">
  <button class="icon-btn" onclick={() => { open = !open; msg = '' }} aria-label="Jump to…" aria-haspopup="dialog" aria-expanded={open} title="Jump to the first unread message or a date"><Icon name="clock" /></button>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="away" onclick={() => (open = false)}></div>
    <div class="pop" role="dialog" aria-label="Jump to">
      <button class="btn ghost" onclick={unread}><Icon name="bell" size={14} /> First unread message</button>
      <form onsubmit={date}>
        <label>Jump to a date<input type="date" bind:value={day} max={today} /></label>
        <button class="btn" disabled={!day}>Go</button>
      </form>
      {#if msg}<p role="status">{msg}</p>{/if}
    </div>
  {/if}
</span>

<style>
  .jw { position: relative; display: inline-flex; } .away { position: fixed; inset: 0; z-index: 14; }
  .pop { position: absolute; z-index: 15; right: 0; top: calc(100% + 6px); width: 260px; display: grid; gap: 10px; padding: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  .pop .btn { display: inline-flex; gap: 8px; align-items: center; justify-content: center; }
  form { display: grid; gap: 6px; } label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); } input { font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
  p { margin: 0; font-size: 12px; color: var(--muted); }
</style>
