<script lang="ts">
  let { onpick, onclose }: { onpick: (e: string) => void; onclose: () => void } = $props()
  // Open upward unless the anchor is too close to the top of the window.
  let down = $state(false)
  const place = (el: HTMLElement) => { down = (el.parentElement?.getBoundingClientRect().top ?? 999) < 360 }
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
<div class="picker" class:down use:place role="dialog" aria-label="Emoji picker">
  {#each SETS as [title, list] (title)}
    <div class="label">{title}</div>
    <div class="grid">{#each list as e (e)}<button onclick={() => { onpick(e); onclose() }} aria-label={e}>{e}</button>{/each}</div>
  {/each}
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 30; }

  .picker { position: absolute; z-index: 31; bottom: calc(100% + 8px); right: 0; width: 292px; max-height: 320px; overflow-y: auto; padding: 8px 10px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
  /* On a phone it sits above the message box across the screen, never clipped by the edge it was opened from. */
  @media (max-width: 520px) { .picker, .picker.down { position: fixed; left: 8px; right: 8px; width: auto; top: auto; bottom: 76px; } }
  .picker.down { bottom: auto; top: calc(100% + 8px); }
  .label { margin: 8px 2px 4px; } .grid { display: grid; grid-template-columns: repeat(8, 1fr); }
  .grid button { height: 32px; font-size: 19px; border-radius: 6px; } .grid button:hover { background: var(--tile); }
</style>
