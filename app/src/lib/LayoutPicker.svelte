<script lang="ts">
  import { LAYOUTS, type Layout } from './layout'
  let { value, onpick, label = 'Message layout' }: { value: Layout | undefined; onpick: (l: Layout) => void; label?: string } = $props()
</script>

<div class="lp" role="radiogroup" aria-label={label}>
  {#each LAYOUTS as l (l.id)}
    <button type="button" role="radio" aria-checked={value === l.id} class:on={value === l.id} onclick={() => onpick(l.id)} title={l.hint}>
      <span class="mini {l.id}" aria-hidden="true">
        <i class="a"><b></b><s></s></i>
        <i class="b"><b></b><s></s></i>
        <i class="c"><b></b><s></s></i>
      </span>
      <span class="n">{l.label}</span>
    </button>
  {/each}
</div>

<style>
  .lp { display: grid; grid-template-columns: repeat(auto-fit, minmax(66px, 1fr)); gap: 6px; }
  button { display: grid; gap: 5px; justify-items: center; padding: 6px 4px 5px; border-radius: 9px; background: var(--tile); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); font-size: 12px; }
  button:hover { color: var(--text); }
  button.on { box-shadow: inset 0 0 0 2px var(--accent); color: var(--text); font-weight: 600; }
  .mini { display: grid; gap: 3px; width: 100%; max-width: 64px; padding: 4px; border-radius: 6px; background: var(--bg); min-height: 38px; }
  .mini i { display: flex; gap: 3px; align-items: center; }
  .mini b { flex: none; width: 5px; height: 5px; border-radius: 50%; background: var(--muted); opacity: .6; }
  .mini s { flex: 1; height: 5px; border-radius: 3px; background: var(--line); }
  /* what each layout looks like in miniature */
  .aligned .b { flex-direction: row-reverse; } .aligned .b b { display: none; } .aligned .b s { background: color-mix(in srgb, var(--accent) 45%, var(--line)); max-width: 70%; flex: none; width: 70%; } .aligned .a s, .aligned .c s { max-width: 70%; flex: none; width: 70%; border-radius: 5px; }
  .cards i { padding: 2px 3px; border-radius: 3px; box-shadow: 0 0 0 1px var(--line); } .cards s { background: var(--line); }
  .lines { gap: 2px; } .lines b { display: none; } .lines s { height: 3px; } .lines i::before { content: ''; width: 8px; height: 3px; border-radius: 2px; background: var(--muted); opacity: .6; }
  .n { line-height: 1.1; }
</style>
