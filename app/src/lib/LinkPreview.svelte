<script lang="ts">
  import { chat } from './matrix.svelte'
  import { thumb } from './media'
  import type { Preview } from './linkpreview'
  let { body, encrypted }: { body: string; encrypted: boolean } = $props()
  let card = $state<Preview | null>(null)
  let img = $state<string>()
  $effect(() => {
    const b = body
    card = null
    img = undefined
    if (encrypted || !chat.privacy.linkPreviews) return
    let live = true
    chat.linkPreview(b).then(async (p) => {
      if (!live || !p) return
      card = p
      if (p.image) img = await thumb(p.image, 96, 'crop').catch(() => undefined)
    }, () => {})
    return () => { live = false }
  })
</script>

{#if card}
  <a class="lp" href={card.url} target="_blank" rel="noopener noreferrer nofollow">
    {#if img}<img src={img} alt="" />{/if}
    <span class="t"><small>{card.site}</small>{#if card.title}<b>{card.title}</b>{/if}{#if card.description}<span class="d">{card.description}</span>{/if}</span>
  </a>
{/if}

<style>
  .lp { display: flex; gap: 10px; max-width: min(100%, 480px); margin-top: 6px; padding: 8px 10px; border-radius: 10px; border-left: 3px solid var(--accent); background: var(--tile); color: var(--text); text-decoration: none; }
  .lp:hover { background: color-mix(in srgb, var(--tile) 80%, var(--accent)); }
  img { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex: none; }
  .t { display: grid; gap: 2px; min-width: 0; } small { color: var(--muted); } b { overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .d { color: var(--muted); font-size: 13px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
</style>
