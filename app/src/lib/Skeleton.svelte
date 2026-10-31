<script lang="ts">
  // Placeholder shapes while the app loads: the same layout the app will have, so nothing jumps when it arrives.
  let { variant = 'app' }: { variant?: 'app' | 'list' | 'timeline' } = $props()
  import { readSnapshot } from './snapshot'
  import { initials, shortTime, tileBg } from './ui.svelte'
  // The rooms the list had last time, if this browser remembers them: real names beat grey bars.
  const remembered = (() => {
    if (variant !== 'app') return []
    try { return readSnapshot(JSON.parse(localStorage.getItem('tessera.session') ?? 'null')?.userId ?? '').slice(0, 14) } catch { return [] }
  })()
  const rows = [78, 62, 84, 55, 70, 66, 80, 58]
  const msgs = [[46, 82], [34, 58], [52, 70], [28, 44], [40, 76]]
</script>

{#snippet list()}
  <div class="list" aria-hidden="true">
    {#each remembered as r (r.id)}
      <div class="row real" class:unread={r.unread > 0 && !r.muted} class:muted={r.muted}>
        <span class="av tile" class:round={r.isDM} style={tileBg(r.name)}>{initials(r.name)}</span>
        <span class="lines"><span class="n">{r.name}</span><span class="p">{r.preview}</span></span>
        <span class="side"><time>{r.lastTs ? shortTime(r.lastTs) : ''}</time>{#if r.unread}<b class="badge">{r.unread}</b>{/if}</span>
      </div>
    {/each}
    {#if !remembered.length}
    {#each rows as w, i (i)}
      <div class="row"><span class="av sh"></span><span class="lines"><i class="sh" style="width:{w}%"></i><i class="sh thin" style="width:{Math.max(30, w - 22)}%"></i></span></div>
    {/each}
    {/if}
  </div>
{/snippet}

{#snippet timeline()}
  <div class="tl" aria-hidden="true">
    {#each msgs as [a, b], i (i)}
      <div class="msg"><span class="av sh round"></span><span class="lines"><i class="sh" style="width:{a}%"></i><i class="sh thin" style="width:{b}%"></i></span></div>
    {/each}
  </div>
{/snippet}

{#if variant === 'list'}
  {@render list()}
{:else if variant === 'timeline'}
  {@render timeline()}
{:else}
  <div class="app" role="status" aria-live="polite" aria-label="Loading Tessera">
    <aside>
      <div class="head"><span class="av sh"></span><i class="sh" style="width:90px"></i></div>
      <div class="search sh"></div>
      {@render list()}
    </aside>
    <main>
      <div class="head"><span class="av sh round"></span><i class="sh" style="width:140px"></i></div>
      {@render timeline()}
      <div class="composer sh"></div>
    </main>
  </div>
{/if}

<style>
  .app { height: 100%; display: grid; grid-template-columns: 320px 1fr; background: var(--bg); }
  aside { background: var(--panel); border-right: 1px solid var(--line); display: flex; flex-direction: column; min-width: 0; }
  main { display: flex; flex-direction: column; min-width: 0; }
  .head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px; height: 56px; box-sizing: border-box; }
  main .head { border-bottom: 1px solid var(--line); }
  .search { height: 34px; margin: 0 12px 10px; border-radius: 8px; }
  .list { padding: 4px 8px; display: grid; gap: 4px; } .row, .msg { display: flex; gap: 10px; align-items: center; padding: 8px; }
  .tl { flex: 1; padding: 20px 20px 0; display: grid; align-content: start; gap: 14px; } .msg { align-items: flex-start; padding: 0; }
  .lines { flex: 1; display: grid; gap: 7px; min-width: 0; } i { display: block; height: 12px; border-radius: 6px; } i.thin { height: 9px; }
  .av { flex: none; width: 38px; height: 38px; border-radius: 11px; } .av.round { border-radius: 50%; }
  .composer { margin: 0 16px 16px; height: 50px; border-radius: 12px; }
  .sh { background: linear-gradient(90deg, var(--tile) 0%, color-mix(in srgb, var(--tile) 55%, var(--line)) 50%, var(--tile) 100%); background-size: 220% 100%; animation: shimmer 1.4s ease-in-out infinite; }
  .real .n { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .real.unread .n { font-weight: 700; } .real .p { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .real.muted { opacity: .6; } .real .lines { gap: 1px; } .tile { display: grid; place-items: center; font-weight: 700; font-size: 14px; color: #10131a; }
  .side { display: grid; justify-items: end; gap: 3px; font-size: 11px; color: var(--muted); } .badge { min-width: 20px; padding: 0 6px; border-radius: 10px; background: var(--muted); color: var(--bg); text-align: center; line-height: 20px; }
  @keyframes shimmer { from { background-position: 120% 0; } to { background-position: -100% 0; } }
  @media (prefers-reduced-motion: reduce) { .sh { animation: none; } }
  @media (max-width: 720px) { .app { grid-template-columns: 1fr; } main { display: none; } }
</style>
