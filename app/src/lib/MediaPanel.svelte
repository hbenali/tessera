<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import { t } from './i18n.svelte'
  import Icon from './Icon.svelte'
  import Thumb from './Thumb.svelte'
  import FileCard from './FileCard.svelte'
  import { galleryLinks, galleryMessages, hostOf, monthGroups, monthLabel, type GalleryKind } from './gallery'

  let tab = $state<GalleryKind>('media')
  let failed = $state(false)
  const photos = $derived(galleryMessages(chat.messages, 'media'))
  const files = $derived(galleryMessages(chat.messages, 'files'))
  const links = $derived(galleryLinks(chat.messages))
  const counts = $derived({ media: photos.length, files: files.length, links: links.length })
  // Ten at a time: the next ten appear as you reach the end of the list, reading further back in the room when the
  // loaded messages have no more to show. Reading history only reads, so nothing is sent to the room.
  const PAGE = 10
  let limit = $state(PAGE)
  let busy = $state(false)
  const total = () => counts[tab]
  $effect(() => { chat.activeRoom; tab; limit = PAGE; failed = false })
  const photoGroups = $derived(monthGroups(photos.slice(0, limit), (m) => m.ts, monthLabel))
  const fileGroups = $derived(monthGroups(files.slice(0, limit), (m) => m.ts, monthLabel))
  const linkGroups = $derived(monthGroups(links.slice(0, limit), (l) => l.msg.ts, monthLabel))
  const more = () => total() > limit || chat.hasOlder()
  const when = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  async function next() {
    if (busy || failed || !more()) return
    busy = true
    try {
      if (total() <= limit) {
        const before = total()
        for (let i = 0; i < 12 && chat.hasOlder() && total() < before + PAGE; i++) {
          if (!(await chat.loadOlder())) { failed = true; return }
        }
      }
      limit += PAGE
    } finally { busy = false }
  }

  // Watched again whenever the list changes, so a sentinel that is still in view asks for the next ten.
  let sentinel: HTMLElement | undefined = $state()
  $effect(() => {
    const el = sentinel
    limit; counts[tab]; failed
    if (!el) return
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) void next() })
    io.observe(el)
    return () => io.disconnect()
  })
  const retry = () => { failed = false; void next() }

  function show(id: string) {
    chat.focusEvent = id
    if (matchMedia('(max-width: 720px)').matches) ui.media = false // on a phone the panel covers the chat
  }
  const TABS: [GalleryKind, string][] = [['media', 'Photos'], ['files', 'Files'], ['links', 'Links']]
</script>

<aside aria-label={t('Shared media')}>
  <header><h2>{t('Shared media')}</h2><button class="icon-btn" onclick={() => (ui.media = false)} aria-label={t('Close')}><Icon name="x" size={16} /></button></header>
  <div class="tabs" role="group" aria-label={t('Kind of media')}>
    {#each TABS as [k, label] (k)}<button class:on={tab === k} aria-pressed={tab === k} onclick={() => (tab = k)}>{t(label)}</button>{/each}
  </div>

  <div class="list">
    {#if tab === 'media'}
      {#each photoGroups as g (g.key)}
        <h3>{g.label}</h3>
        <ul class="grid">
          {#each g.items as m (m.id)}
            <li><button class="tile" onclick={(e) => (ui.viewer = { id: m.id, opener: e.currentTarget })} aria-label="{t('Open image')}: {m.senderName}, {when(m.ts)}" title="{m.senderName} · {when(m.ts)}"><Thumb mxc={m.imageMxc!} file={m.imageFile} size={96} /></button></li>
          {/each}
        </ul>
      {/each}
    {:else if tab === 'files'}
      {#each fileGroups as g (g.key)}
        <h3>{g.label}</h3>
        <ul class="rows">
          {#each g.items as m (m.id)}
            <li>
              {#if m.attachment}<FileCard {...m.attachment} sender={m.senderName} ts={m.ts} />{:else if m.audio}<span class="aud"><Icon name="mic" size={14} />{m.audio.name}</span>{/if}
              <button class="link" onclick={() => show(m.id)}>{m.senderName} · {when(m.ts)} · {t('Show in chat')}</button>
            </li>
          {/each}
        </ul>
      {/each}
    {:else}
      {#each linkGroups as g (g.key)}
        <h3>{g.label}</h3>
        <ul class="rows">
          {#each g.items as l (l.id)}
            <li class="lk">
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow"><Icon name="link" size={14} /><b>{hostOf(l.url)}</b><span>{l.url}</span></a>
              <button class="link" onclick={() => show(l.msg.id)}>{l.msg.senderName} · {when(l.msg.ts)} · {t('Show in chat')}</button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}

    {#if !total() && !more()}<p class="empty">{t('Nothing shared in this room yet.')}</p>{/if}
    <div class="more" bind:this={sentinel} role="status">
      {#if failed}<button class="link" onclick={retry}>{t('Could not load earlier messages. Try again')}</button>
      {:else if busy || chat.loadingOlder || more()}{t('Loading…')}
      {:else if total()}{t('That is everything in this room.')}{/if}
    </div>
  </div>
</aside>

<style>
  aside { height: 100%; display: flex; flex-direction: column; overflow: hidden; min-height: 0; background: var(--panel); border-left: 1px solid var(--line); padding: 0 12px 12px; }
  header { display: flex; justify-content: space-between; align-items: center; height: 56px; flex: none; } h2 { margin: 0; font-size: 15px; }
  .tabs { display: flex; gap: 4px; flex: none; padding: 3px; border-radius: 10px; background: var(--tile); }
  .tabs button { flex: 1; padding: 6px 4px; border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--muted); }
  .tabs button.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / .15); }
  .list { flex: 1; min-height: 0; overflow-y: auto; margin-top: 8px; }
  h3 { margin: 12px 2px 6px; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  ul { list-style: none; margin: 0; padding: 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
  .tile { display: block; width: 100%; padding: 0; border-radius: 6px; overflow: hidden; cursor: zoom-in; } .tile:hover { filter: brightness(1.12); }
  .rows li { display: grid; gap: 2px; padding: 6px 2px; }
  .link { justify-self: start; padding: 2px 0; font-size: 12px; color: var(--accent); text-align: left; text-decoration: underline; text-underline-offset: 3px; }
  .lk a { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; padding: 8px 10px; border-radius: 8px; background: var(--tile); color: var(--text); text-decoration: none; min-width: 0; } .lk a:hover { background: var(--line); }
  .lk a b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .lk a span { grid-column: 2; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aud { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: var(--tile); overflow-wrap: anywhere; }
  .empty { margin: 24px 8px; text-align: center; color: var(--muted); }
  .more { padding: 14px 4px 4px; text-align: center; color: var(--muted); font-size: 12px; min-height: 24px; }
</style>
