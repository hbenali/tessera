<script lang="ts">
  import type { Snippet } from 'svelte'
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props()
  const focus = (n: HTMLElement) => n.focus()
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="card" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" use:focus onclick={(e) => e.stopPropagation()}>
    <header><h2>{title}</h2><button onclick={onclose} aria-label="Close">✕</button></header>
    {@render children()}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: #0009; backdrop-filter: blur(4px); display: grid; place-items: center; z-index: 20; }
  .card { width: min(520px, 94vw); max-height: 88vh; overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 22px; box-shadow: 0 30px 80px #000a; outline: none; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  h2 { margin: 0; font-size: 18px; } header button { color: var(--muted); font-size: 16px; }
</style>
