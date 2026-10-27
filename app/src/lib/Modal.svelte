<script lang="ts">
  import type { Snippet } from 'svelte'
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props()
  const focus = (n: HTMLElement) => n.focus()
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="card" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" use:focus onclick={(e) => e.stopPropagation()}>
    <header><h2>{title}</h2><button class="link" onclick={onclose}>Close</button></header>
    {@render children()}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / .5); display: grid; place-items: center; z-index: 20; }
  .card { width: min(480px, 94vw); max-height: 88vh; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px 24px; box-shadow: var(--shadow); outline: none; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  h2 { margin: 0; font-size: 17px; letter-spacing: -.01em; } header button { color: var(--muted); font-size: 13px; } header button:hover { color: var(--text); }
</style>
