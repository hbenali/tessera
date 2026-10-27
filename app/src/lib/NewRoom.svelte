<script lang="ts">
  import Modal from './Modal.svelte'
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  let { join = false }: { join?: boolean } = $props()
  let value = $state('')
  let encrypted = $state(true)
  let error = $state('')
  const focus = (n: HTMLElement) => n.focus()
  async function submit(e: Event) {
    e.preventDefault()
    try {
      if (join) await chat.joinRoom(value.trim())
      else await chat.createRoom(value.trim(), encrypted)
      ui.modal = null
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
</script>

<Modal title={join ? 'Join a room' : 'New room'} onclose={() => (ui.modal = null)}>
  <form onsubmit={submit}>
    <input use:focus bind:value placeholder={join ? '#room:server or room ID' : 'Room name'} required />
    {#if !join}<label><input type="checkbox" bind:checked={encrypted} /> End-to-end encrypted</label>{/if}
    {#if error}<div class="err" role="alert">{error}</div>{/if}
    <button class="primary">{join ? 'Join' : 'Create'}</button>
  </form>
</Modal>

<style>
  form { display: grid; gap: 12px; } input:not([type='checkbox']) { padding: 10px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); }
  label { font-size: 14px; display: flex; gap: 8px; align-items: center; } .err { color: var(--danger); font-size: 13px; }
  .primary { padding: 10px; border-radius: 10px; background: var(--accent); color: #1a1208; font-weight: 600; }
</style>
