<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import { t } from './i18n.svelte'
  import Modal from './Modal.svelte'
  import { render } from './markdown'
  import { renderPages } from './exportdraw'
  import { plainMentions } from './mentions'
  import { effectiveLayout } from './layout'
  import { buildPdf, canvasBlob, download, fileName, readTheme, saveBlob, sliceRange, toCsv, pickTheme, type CsvMsg, type ExportMsg, type Look } from './export'

  const sel = $derived(ui.exportImage ?? { from: null, to: null })
  let format = $state<'png' | 'pdf' | 'csv'>('png')
  let images = $state(true)
  let source = $state(false)
  let look = $state<Look>('app')
  let busy = $state(false)
  let status = $state('')
  let err = $state('')
  let stop = false

  const label = (id: string | null, none: string) => {
    const m = chat.messages.find((x) => x.id === id)
    return m ? `${m.senderName}, ${new Date(m.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}: ${m.body.slice(0, 60) || '…'}` : none
  }

  /** Page back until the first message of the range is loaded (or the room starts). Paging only reads: no receipt is sent. */
  async function load() {
    for (let i = 0; i < 2000 && !stop && chat.hasOlder(); i++) {
      if (sel.from && chat.messages.some((m) => m.id === sel.from)) break
      status = t('Loading earlier messages…') + ` ${chat.messages.length}`
      if (!(await chat.loadOlder())) throw new Error(t('The server would not give earlier messages. Try again in a moment.'))
      chat.refreshMessages()
    }
  }

  /** A small avatar picture, or null when it cannot be loaded. Decoded from the thumbnail's bytes, so no page policy gets in the way. */
  async function bitmap(mxc: string, size: number): Promise<ImageBitmap | null> {
    try { return await createImageBitmap(await chat.thumbBlob(mxc, size)) } catch { return null }
  }

  async function run() {
    busy = true; err = ''; stop = false
    const room = chat.active
    try {
      await load()
      if (stop) return
      const msgs = sliceRange(chat.messages.map((m): ExportMsg => { const r = m.replyTo ? chat.messages.find((x) => x.id === m.replyTo) : undefined; return { ...m, html: render(m.body, { name: chat.nameOf, me: chat.userId, pills: m.pills }), reply: m.replyTo ? { name: r?.senderName ?? '', text: plainMentions(r?.body ?? 'earlier message', chat.nameOf) } : undefined } }), sel)
      if (!msgs) throw new Error(t('One of the chosen messages is no longer in the room.'))
      if (!msgs.length) throw new Error(t('There is nothing to export.'))
      const now = new Date()
      if (format === 'csv') {
        saveBlob(new Blob([toCsv(msgs as CsvMsg[], source)], { type: 'text/csv;charset=utf-8' }), fileName(room?.name ?? 'chat', now, 1, 1, 'csv'))
        status = t('File saved')
        return
      }
      const pages = await renderPages(msgs, {
        title: room?.name ?? 'Chat',
        subtitle: room?.dmUser ? undefined : room?.topic || (room ? `${room.memberCount} ${room.memberCount === 1 ? 'member' : 'members'}` : undefined),
        encrypted: room?.encrypted,
        isDM: room?.isDM,
        roomAvatar: room?.avatar ? await bitmap(room.avatar, 32) : null,
        layout: effectiveLayout(ui.layout, room?.theme.layout ? { [room.id]: room.theme.layout } : {}, room?.id),
        avatar: (mxc) => bitmap(mxc, 36),
        source,
        theme: pickTheme(look, readTheme()),
        image: images ? async (m) => { try { const f = chat.messages.find((x) => x.id === m.id); return f?.imageMxc ? await createImageBitmap(await chat.original(f.imageMxc, f.imageFile, false)) : null } catch { return null } } : undefined,
        progress: (d, n) => (status = `${t('Drawing')} ${d}/${n}`),
        cancelled: () => stop,
      })
      if (stop) return
      if (format === 'pdf') {
        const jp = await Promise.all(pages.map(async (c) => ({ jpeg: new Uint8Array(await (await canvasBlob(c, 'image/jpeg', 0.92)).arrayBuffer()), width: c.width / 2, height: c.height / 2 })))
        saveBlob(new Blob([buildPdf(jp) as BlobPart], { type: 'application/pdf' }), fileName(room?.name ?? 'chat', now, 1, 1, 'pdf'))
        status = t('File saved')
        return
      }
      for (let i = 0; i < pages.length; i++) await download(pages[i], fileName(room?.name ?? 'chat', now, i + 1, pages.length))
      status = pages.length > 1 ? `${pages.length} ${t('images saved')}` : t('Image saved')
    } catch (e) {
      err = e instanceof Error ? e.message : t('That did not work')
    } finally {
      busy = false
      if (stop) status = ''
    }
  }
  const close = () => { stop = true; ui.exportDialog = false }
</script>

<Modal title={t('Export conversation')} onclose={close}>
  <p class="hint">{t('Saves the conversation as a picture, PDF or text file. Nothing is sent: no read receipt, no notification.')}</p>
  <dl>
    <dt>{t('From')}</dt>
    <dd><span>{label(sel.from, t('The start of the conversation'))}</span>{#if sel.from}<button class="link" disabled={busy} onclick={() => (sel.from = null)}>{t('Reset')}</button>{/if}</dd>
    <dt>{t('To')}</dt>
    <dd><span>{label(sel.to, t('The latest message'))}</span>{#if sel.to}<button class="link" disabled={busy} onclick={() => (sel.to = null)}>{t('Reset')}</button>{/if}</dd>
  </dl>
  <p class="hint">{t('To choose the first or last message, use the ⋯ menu on a message: “Export from here” and “Export up to here”. Close this window first; the choice is kept.')}</p>
  <fieldset class="fmt" disabled={busy}><legend>{t('Format')}</legend>
    <label><input type="radio" bind:group={format} value="png" />{t('Image (PNG)')}</label>
    <label><input type="radio" bind:group={format} value="pdf" />PDF</label>
    <label><input type="radio" bind:group={format} value="csv" />{t('Text (CSV)')}</label>
  </fieldset>
  <label class="chk"><input type="checkbox" bind:checked={source} disabled={busy} />{t('Print the Markdown source instead of the formatted text')}</label>
  {#if format !== 'csv'}<fieldset class="fmt" disabled={busy}><legend>{t('Colours')}</legend>
    <label><input type="radio" bind:group={look} value="app" />{t('Like the app')}</label>
    <label><input type="radio" bind:group={look} value="light" />{t('Light')}</label>
    <label><input type="radio" bind:group={look} value="dark" />{t('Dark')}</label>
  </fieldset>{/if}
  {#if format !== 'csv'}<label class="chk"><input type="checkbox" bind:checked={images} disabled={busy} />{t('Include pictures')}</label>{/if}
  {#if err}<p class="err" role="alert">{err}</p>{:else if status}<p class="ok" role="status">{status}</p>{/if}
  <div class="row">
    <button class="btn" disabled={busy} onclick={run}>{busy ? t('Working…') : t('Download image')}</button>
    {#if busy}<button class="btn ghost" onclick={() => (stop = true)}>{t('Cancel')}</button>{/if}
  </div>
</Modal>

<style>
  .hint { margin: 0 0 10px; font-size: 13px; color: var(--muted); }
  dl { margin: 0 0 10px; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: baseline; }
  dt { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  dd { margin: 0; display: flex; gap: 10px; justify-content: space-between; min-width: 0; } dd span { overflow-wrap: anywhere; }
  dd .link { color: var(--accent); font-size: 13px; flex: none; }
  .fmt { border: 0; padding: 0; margin: 0 0 6px; display: flex; gap: 14px; flex-wrap: wrap; } .fmt legend { padding: 0; margin-bottom: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); } .fmt label { display: flex; align-items: center; gap: 6px; } .fmt input { width: auto; }
  .chk { display: flex; align-items: center; gap: 8px; margin: 6px 0; } .chk input { width: auto; }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  .ok { color: var(--ok); font-size: 13px; margin: 8px 0 0; } .err { color: var(--danger); font-size: 13px; margin: 8px 0 0; }
</style>
