<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'
  const r = $derived(chat.active)
  let confirm = $state(false)
</script>

{#if r}
  <aside aria-label="Room details">
    <header><h2>Details</h2><button class="icon-btn" onclick={() => (ui.details = false)} aria-label="Close details"><Icon name="x" /></button></header>
    <div class="hero"><Avatar name={r.name} size={64} round={r.isDM} /><h3>{r.name}</h3>{#if r.topic}<p>{r.topic}</p>{/if}</div>
    <div class="enc" class:on={r.encrypted}><Icon name={r.encrypted ? 'shield' : 'info'} size={16} />{r.encrypted ? 'End-to-end encrypted' : 'Not encrypted'}</div>
    <h4 class="label">{chat.members.length} {chat.members.length === 1 ? 'member' : 'members'}</h4>
    <ul>
      {#each chat.members as m (m.id)}
        <li><Avatar name={m.name} size={28} round /><span class="n">{m.name}</span>{#if m.id === chat.userId}<span class="mono you">you</span>{/if}</li>
      {/each}
    </ul>
    <div class="actions">
      {#if confirm}
        <p>Leave {r.name}?</p>
        <button class="btn danger" onclick={() => chat.leaveRoom(r.id)}>Leave room</button>
        <button class="btn ghost" onclick={() => (confirm = false)}>Cancel</button>
      {:else}
        <button class="btn ghost" onclick={() => (confirm = true)}><Icon name="logout" size={15} /> Leave room</button>
      {/if}
    </div>
  </aside>
{/if}

<style>
  aside { height: 100%; overflow-y: auto; background: var(--panel); border-left: 1px solid var(--line); padding: 0 16px 16px; }
  header { display: flex; justify-content: space-between; align-items: center; height: 56px; } h2 { margin: 0; font-size: 15px; }
  .hero { display: grid; justify-items: center; text-align: center; gap: 6px; padding: 8px 0 14px; } .hero h3 { margin: 6px 0 0; font-size: 18px; letter-spacing: -.01em; } .hero p { margin: 0; color: var(--muted); }
  .enc { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 8px; background: var(--tile); color: var(--muted); } .enc.on { color: var(--ok); }
  h4 { margin: 18px 0 6px; } ul { list-style: none; margin: 0; padding: 0; } li { display: flex; align-items: center; gap: 10px; padding: 5px 0; } .n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .you { color: var(--muted); }
  .actions { margin-top: 20px; display: grid; gap: 8px; } .actions p { margin: 0; } .btn { display: inline-flex; gap: 8px; align-items: center; justify-content: center; } .btn.danger { background: var(--danger); color: var(--bg); }
</style>
