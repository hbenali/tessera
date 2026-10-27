<script lang="ts">
  import { chat, type MessageHit } from './matrix.svelte'
  import { shortTime } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'
  let { onclose }: { onclose: () => void } = $props()
  let q = $state('')
  let sel = $state(0)

  type Item = { kind: 'room'; id: string; name: string; dm: boolean } | { kind: 'msg'; hit: MessageHit }
  const items = $derived.by<Item[]>(() => {
    const term = q.toLowerCase()
    const rooms: Item[] = chat.rooms
      .filter((r) => !r.isSpace && !r.invited && r.name.toLowerCase().includes(term))
      .slice(0, 6)
      .map((r) => ({ kind: 'room', id: r.id, name: r.name, dm: r.isDM }))
    const msgs: Item[] = chat.searchMessages(q).map((hit) => ({ kind: 'msg', hit }))
    return [...rooms, ...msgs]
  })

  function go(it: Item) {
    if (it.kind === 'room') chat.openRoom(it.id)
    else chat.openMessage(it.hit)
    onclose()
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
    else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); e.preventDefault() }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); e.preventDefault() }
    else if (e.key === 'Enter' && items[sel]) go(items[sel])
  }
  const focus = (n: HTMLElement) => n.focus()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="box" role="dialog" tabindex="-1" aria-label="Search" onclick={(e) => e.stopPropagation()}>
    <div class="field"><Icon name="search" size={16} /><input use:focus bind:value={q} oninput={() => (sel = 0)} onkeydown={key} placeholder="Jump to a room or search loaded messages" aria-label="Search rooms and messages" /></div>
    <div class="results" role="listbox" aria-label="Results">
      {#each items as it, i (it.kind === 'room' ? 'r' + it.id : 'm' + it.hit.roomId + it.hit.eventId)}
        <button role="option" aria-selected={i === sel} class:sel={i === sel} onclick={() => go(it)}>
          {#if it.kind === 'room'}
            <Avatar name={it.name} size={26} round={it.dm} /><span class="t">{it.name}</span><span class="k">Room</span>
          {:else}
            <Avatar name={it.hit.sender} size={26} round /><span class="t"><b>{it.hit.sender}</b> in {it.hit.roomName}<small>{it.hit.snippet}</small></span><span class="k">{shortTime(it.hit.ts)}</span>
          {/if}
        </button>
      {/each}
      {#if q.length >= 2 && !items.length}<p class="none">Nothing found. Search covers messages loaded on this device; scroll up in a room to load more history.</p>{/if}
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / .5); display: grid; place-items: start center; padding-top: 12vh; z-index: 10; }
  .box { width: min(600px, 94vw); background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
  .field { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); color: var(--muted); }
  .field input { border: 0; background: none; padding: 15px 0; font-size: 16px; color: var(--text); } .field input:focus { border: 0; }
  .results { max-height: 52vh; overflow-y: auto; padding: 6px; }
  button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px; border-radius: 8px; text-align: left; } .sel { background: var(--tile); }
  .t { flex: 1; min-width: 0; display: grid; overflow: hidden; } .t small { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .k { color: var(--muted); font-size: 12px; flex: none; }
  .none { margin: 0; padding: 18px 12px; color: var(--muted); font-size: 13px; }
</style>
