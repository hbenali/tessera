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
    <button class="btn">{join ? 'Join' : 'Create'}</button>
  </form>
</Modal>

<style>
  form { display: grid; gap: 16px; } label { display: flex; gap: 10px; align-items: center; font-size: 14px; } .err { color: var(--accent); font-size: 13px; }
  input[type='checkbox'] { accent-color: var(--accent); width: 16px; height: 16px; }
</style>
