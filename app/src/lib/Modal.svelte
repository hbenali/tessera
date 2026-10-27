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
  .scrim { position: fixed; inset: 0; background: color-mix(in srgb, var(--bg) 82%, transparent); display: grid; place-items: center; z-index: 20; }
  .card { width: min(500px, 94vw); max-height: 88vh; overflow: auto; border-radius: 10px; background: var(--panel); padding: 22px 24px 26px; outline: none; }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font: 800 26px/1 var(--display); letter-spacing: -.03em; } header button { font-size: 13px; color: var(--muted); }
</style>
