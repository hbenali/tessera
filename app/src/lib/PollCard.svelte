<script lang="ts">
  import { chat } from './matrix.svelte'
  import type { Msg } from './matrix.svelte'
  import { toggleSelection } from './poll'
  let { m }: { m: Msg } = $props()
  const p = $derived(m.poll!)
  const total = $derived(Math.max(1, p.tally.voters))
  let err = $state('')
  async function pick(id: string) {
    if (p.tally.ended) return
    err = ''
    try { await chat.votePoll(m.id, toggleSelection(p.tally.mine, id, p.start.maxSelections)) } catch (e) { err = e instanceof Error ? e.message : 'Could not vote' }
  }
  async function end() { err = ''; try { await chat.endPoll(m.id) } catch (e) { err = e instanceof Error ? e.message : 'Could not end the poll' } }
</script>

<div class="poll" role="group" aria-label="Poll: {p.start.question}">
  <b class="q">{p.start.question}</b>
  <small>{p.tally.ended ? 'Final results' : p.start.maxSelections > 1 ? `Choose up to ${p.start.maxSelections}` : 'Choose one'}{p.start.disclosed ? '' : p.tally.ended ? '' : ' · results show when it ends'}</small>
  <ul>
    {#each p.start.answers as a (a.id)}
      {@const n = p.tally.counts[a.id] ?? 0}
      {@const mine = p.tally.mine.includes(a.id)}
      <li>
        <button class="ans" class:mine disabled={p.tally.ended} aria-pressed={mine} onclick={() => pick(a.id)}>
          {#if p.tally.visible}<span class="bar" style="width:{Math.round((n / total) * 100)}%"></span>{/if}
          <span class="mark" aria-hidden="true">{mine ? '●' : '○'}</span>
          <span class="t">{a.text}</span>
          {#if p.tally.visible}<span class="n">{n}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
  <small>{p.tally.visible ? `${p.tally.voters} ${p.tally.voters === 1 ? 'vote' : 'votes'}` : p.tally.mine.length ? 'You voted' : 'Not voted yet'}{#if p.creator && !p.tally.ended} · <button class="link" onclick={end}>End poll</button>{/if}</small>
  {#if err}<small class="err" role="alert">{err}</small>{/if}
</div>

<style>
  .poll { display: grid; gap: 6px; max-width: min(100%, 420px); padding: 10px 12px; border-radius: 12px; background: var(--tile); border: 1px solid var(--line); margin-top: 4px; }
  .q { font-size: 15px; } small { color: var(--muted); } ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .ans { position: relative; display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border-radius: 8px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); text-align: left; overflow: hidden; }
  .ans.mine { box-shadow: inset 0 0 0 2px var(--accent); } .ans:disabled { cursor: default; }
  .bar { position: absolute; inset: 0 auto 0 0; background: color-mix(in srgb, var(--accent) 22%, transparent); z-index: 0; } .mark, .t, .n { position: relative; z-index: 1; } .t { flex: 1; overflow-wrap: anywhere; } .n { font-variant-numeric: tabular-nums; color: var(--muted); }
  .link { color: var(--accent); text-decoration: underline; } .err { color: var(--danger); }
</style>
