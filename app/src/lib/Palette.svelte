<script lang="ts">
  import { chat } from './matrix.svelte'
  let { onclose }: { onclose: () => void } = $props()
  let q = $state('')
  let sel = $state(0)
  const results = $derived(
    chat.rooms.filter((r) => !r.isSpace && r.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8),
  )
  function go(id: string) { chat.openRoom(id); onclose() }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
    else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, results.length - 1); e.preventDefault() }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); e.preventDefault() }
    else if (e.key === 'Enter' && results[sel]) go(results[sel].id)
  }
  const focus = (n: HTMLElement) => n.focus()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="box" role="dialog" tabindex="-1" aria-label="Jump to" onclick={(e) => e.stopPropagation()}>
    <input use:focus bind:value={q} oninput={() => (sel = 0)} onkeydown={key} placeholder="Jump to a room…" />
    {#each results as r, i (r.id)}
      <button class:sel={i === sel} onclick={() => go(r.id)}>{r.isDM ? '@' : '#'} {r.name}</button>
    {/each}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: #0008; display: grid; place-items: start center; padding-top: 14vh; z-index: 10; }
  .box { width: min(560px, 92vw); background: var(--bg-2); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: 0 30px 80px #000a; }
  input { width: 100%; padding: 16px; background: none; border: 0; border-bottom: 1px solid var(--line); font-size: 16px; outline: none; }
  button { display: block; width: 100%; text-align: left; padding: 10px 16px; } .sel { background: var(--bg-3); }
</style>
