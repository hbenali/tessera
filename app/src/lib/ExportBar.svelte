<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import { t } from './i18n.svelte'

  const sel = $derived(ui.exportImage ?? { from: null, to: null })
  const name = (id: string | null, none: string) => { const m = chat.messages.find((x) => x.id === id); return m ? `${m.senderName}, ${new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : none }
</script>

<!-- Not a modal: the timeline stays usable, so the other end of the range can be picked with ⋯ on another message. -->
<div class="bar" role="region" aria-label={t('Export conversation')}>
  <span><b>{t('From')}</b> {name(sel.from, t('The start of the conversation'))} · <b>{t('To')}</b> {name(sel.to, t('The latest message'))}</span>
  <button class="btn" onclick={() => (ui.exportDialog = true)}>{t('Export…')}</button>
  <button class="btn ghost" onclick={() => (ui.exportImage = null)}>{t('Cancel')}</button>
</div>

<style>
  .bar { position: fixed; z-index: 25; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; max-width: calc(100vw - 24px); padding: 8px 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); font-size: 13px; }
  .btn { padding: 5px 12px; }
</style>
