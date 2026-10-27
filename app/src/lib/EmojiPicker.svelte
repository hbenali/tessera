<script lang="ts">
  let { onpick, onclose }: { onpick: (e: string) => void; onclose: () => void } = $props()
  const SETS: [string, string[]][] = [
    ['Frequent', ['👍', '❤️', '😂', '🎉', '👀', '🙏', '🔥', '✅', '😮', '😢']],
    ['Faces', ['😀', '😃', '😄', '😁', '😆', '😅', '🙂', '😉', '😊', '😍', '😘', '😎', '🤔', '😐', '😴', '😭', '😡', '🤯', '🥳', '🤗']],
    ['Gestures', ['👋', '👏', '🙌', '💪', '🤝', '✌️', '🤞', '👌', '☝️', '👎', '🖐️', '🤷']],
    ['Things', ['🚀', '💡', '📌', '⭐', '💯', '⚡', '🎯', '☕', '🍕', '🎶', '🌈', '🐛']],
  ]
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>
<div class="picker" role="dialog" aria-label="Emoji picker">
  {#each SETS as [title, list] (title)}
    <div class="label">{title}</div>
    <div class="grid">{#each list as e (e)}<button onclick={() => { onpick(e); onclose() }} aria-label={e}>{e}</button>{/each}</div>
  {/each}
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 30; }
  .picker { position: absolute; z-index: 31; bottom: calc(100% + 8px); right: 0; width: 292px; max-height: 320px; overflow-y: auto; padding: 8px 10px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
  .label { margin: 8px 2px 4px; } .grid { display: grid; grid-template-columns: repeat(8, 1fr); }
  .grid button { height: 32px; font-size: 19px; border-radius: 6px; } .grid button:hover { background: var(--tile); }
</style>
