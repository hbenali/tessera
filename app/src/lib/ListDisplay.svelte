<script lang="ts">
  import { t } from './i18n.svelte'
  import { ui } from './ui.svelte'
  import { WIDTH, type AvatarSize, type BadgeStyle, type Rows } from './listprefs'

  let { onclose, rail = false }: { onclose: () => void; rail?: boolean } = $props()
  let box: HTMLElement | undefined = $state()
  const L = $derived(ui.list)
  $effect(() => { box?.querySelector<HTMLElement>('input, button')?.focus() })

  const ROWS: [Rows, string][] = [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['large', 'Large']]
  const AVATARS: [AvatarSize, string][] = [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']]
  const BADGES: [BadgeStyle, string][] = [['count', 'Count'], ['dot', 'Dot']]
  const SWITCHES: ['previews' | 'sections' | 'icons' | 'rail', string, string][] = [
    ['previews', 'Show message previews', 'The last message under each room name.'],
    ['sections', 'Group under headings', 'Favourites, People, Rooms and Low priority, each one foldable.'],
    ['icons', 'Show status icons', 'Lock, star, mute and mentions-only marks beside a name.'],
    ['rail', 'Icons only', 'A narrow strip of avatars; hover for the name. Wide windows only.'],
  ]
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onclose() } }} onpointerdown={(e) => { if (!(e.target as Element)?.closest?.('.display, [aria-haspopup=dialog]')) onclose() }} />

<div class="display" class:rail role="dialog" aria-label={t('List display')} bind:this={box}>
  <label class="row"><span>{t('Width')}</span><output>{L.width}px</output>
    <input type="range" min={WIDTH.min} max={WIDTH.max} step={WIDTH.step} value={L.width} oninput={(e) => ui.setList({ width: +e.currentTarget.value })} disabled={L.rail} aria-valuetext="{L.width} pixels" /></label>

  <div class="row" role="radiogroup" aria-label={t('Rows')}><span>{t('Rows')}</span>
    <div class="seg">{#each ROWS as [v, label] (v)}<button role="radio" aria-checked={L.rows === v} class:on={L.rows === v} onclick={() => ui.setList({ rows: v })}>{t(label)}</button>{/each}</div></div>

  <div class="row" role="radiogroup" aria-label={t('Avatars')}><span>{t('Avatars')}</span>
    <div class="seg">{#each AVATARS as [v, label] (v)}<button role="radio" aria-checked={L.avatar === v} class:on={L.avatar === v} onclick={() => ui.setList({ avatar: v })}>{t(label)}</button>{/each}</div></div>

  <div class="row" role="radiogroup" aria-label={t('Unread badges')}><span>{t('Unread badges')}</span>
    <div class="seg">{#each BADGES as [v, label] (v)}<button role="radio" aria-checked={L.badge === v} class:on={L.badge === v} onclick={() => ui.setList({ badge: v })}>{t(label)}</button>{/each}</div></div>

  {#each SWITCHES as [k, label, hint] (k)}
    <label class="sw"><span><b>{t(label)}</b><small>{t(hint)}</small></span>
      <input type="checkbox" role="switch" checked={L[k]} onchange={(e) => { ui.setList({ [k]: e.currentTarget.checked }); if (k === 'rail') onclose() /* the list changes size under the panel: close it rather than leave it squeezed */ }} /></label>
  {/each}

  <button class="reset" onclick={() => ui.resetList()}>{t('Reset to defaults')}</button>
</div>

<style>
  .display { position: absolute; z-index: 6; top: calc(100% - 2px); left: 8px; right: 8px; max-width: 340px; display: grid; gap: 10px; padding: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); max-height: calc(100dvh - 90px); overflow-y: auto; }
  /* Beside the narrow strip, not inside it. */
  .display.rail { left: calc(100% + 8px); right: auto; top: 8px; width: 300px; }
  .row { display: grid; gap: 5px; font-size: 12px; color: var(--muted); } label.row { grid-template-columns: 1fr auto; } label.row input { grid-column: 1 / -1; width: 100%; padding: 0; accent-color: var(--accent); background: none; border: 0; } output { color: var(--text); font-variant-numeric: tabular-nums; }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 9px; background: var(--tile); } .seg button { flex: 1; padding: 5px 4px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--muted); } .seg button.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / .15); }
  .sw { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .sw span { display: grid; min-width: 0; } .sw b { font-size: 13px; font-weight: 600; } .sw small { color: var(--muted); font-size: 11px; line-height: 1.35; } .sw input { flex: none; width: auto; }
  .reset { justify-self: start; font-size: 12px; color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
</style>
