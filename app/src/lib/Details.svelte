<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'
  import { HISTORY, JOIN_RULES, roleLabel } from './moderation'
  const r = $derived(chat.active)
  let confirm = $state(false)
  let editing = $state(false)
  let name = $state('')
  let topic = $state('')
  let err = $state('')
  const canEdit = $derived(r ? chat.canEditRoom(r.id) : false)
  function startEdit() { if (!r) return; name = r.name; topic = r.topic ?? ''; err = ''; editing = true }
  let photo: HTMLInputElement | undefined = $state()
  async function pickPhoto() {
    const f = photo?.files?.[0]
    if (!f || !r) return
    if (!f.type.startsWith('image/')) { err = 'Choose an image file'; return }
    try { await chat.setRoomAvatar(r.id, f) } catch (x) { err = x instanceof Error ? x.message : 'Could not upload' }
  }
  async function save(e: Event) {
    e.preventDefault()
    if (!r) return
    try {
      if (name.trim() && name.trim() !== r.name) await chat.setRoomName(r.id, name)
      if (topic.trim() !== (r.topic ?? '')) await chat.setRoomTopic(r.id, topic)
      editing = false
    } catch (x) { err = x instanceof Error ? x.message : 'Could not save' }
  }
  let encConfirm = $state(false)
  let reporting = $state(false)
  let reason = $state('')
  let note = $state('')
  const run = async (f: () => Promise<unknown>, ok = '') => { err = ''; note = ''; try { await f(); note = ok } catch (x) { err = x instanceof Error ? x.message : 'That did not work' } }
  let level = $state<'all' | 'mentions' | 'mute'>('all')
  $effect(() => { if (r) level = chat.roomNotifs(r.id) })
  async function pick(l: typeof level) { if (!r) return; level = l; await chat.setRoomNotifs(r.id, l) }
</script>

{#if r}
  <aside aria-label="Room details">
    <header><h2>Details</h2><button class="icon-btn" onclick={() => (ui.details = false)} aria-label="Close details"><Icon name="x" /></button></header>
    <div class="hero"><Avatar name={r.name} size={64} round={r.isDM} src={r.avatar} /><h3>{r.name}</h3>{#if r.topic}<p>{r.topic}</p>{/if}
      {#if canEdit && !r.isDM && !editing}<button class="btn ghost" onclick={startEdit}><Icon name="edit" size={14} /> Edit room</button>{/if}
    </div>
    {#if editing}
      <form class="edit" onsubmit={save}>
        <input type="file" accept="image/*" hidden bind:this={photo} onchange={pickPhoto} />
        <button type="button" class="btn ghost" onclick={() => photo?.click()}>Change photo</button>
        <label>Name<input bind:value={name} maxlength="100" required /></label>
        <label>Topic<textarea bind:value={topic} rows="3" maxlength="500"></textarea></label>
        {#if err}<p class="err" role="alert">{err}</p>{/if}
        <div class="row"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" onclick={() => (editing = false)}>Cancel</button></div>
      </form>
    {/if}
    <div class="enc" class:on={r.encrypted}><Icon name={r.encrypted ? 'shield' : 'info'} size={16} />{r.encrypted ? 'End-to-end encrypted' : 'Not encrypted'}</div>
    <button class="btn ghost fav" aria-pressed={r.favourite} onclick={() => chat.setFavourite(r.id, !r.favourite)}><Icon name="star" size={15} /> {r.favourite ? 'Remove from favourites' : 'Add to favourites'}</button>
    <label class="quiet"><input type="checkbox" checked={chat.isQuiet(r.id)} onchange={(e) => chat.setQuiet(r.id, e.currentTarget.checked)} /> <span><b>Read quietly</b><small>Open this room and read everything without showing people that you have. Your unread count still clears.</small></span></label>
    {#if chat.settings && !r.isDM}
      {@const st = chat.settings}
      <h4 class="label">Room settings</h4>
      <label class="set">Who can join
        <select disabled={!st.can.joinRules} value={st.joinRule} onchange={(e) => run(() => chat.setJoinRule(e.currentTarget.value as never))}>
          {#each JOIN_RULES as [v, t, d] (v)}<option value={v} title={d}>{t}</option>{/each}
        </select>
      </label>
      <label class="set">Who can read the history
        <select disabled={!st.can.history} value={st.history} onchange={(e) => run(() => chat.setHistory(e.currentTarget.value as never))}>
          {#each HISTORY as [v, t, d] (v)}<option value={v} title={d}>{t}</option>{/each}
        </select>
      </label>
      {#if !r.encrypted && st.can.encrypt}
        {#if encConfirm}
          <p class="warn">Encryption cannot be turned off afterwards, and bridges and bots may stop working. Turn it on?</p>
          <div class="row"><button class="btn" onclick={() => run(async () => { await chat.enableEncryption(); encConfirm = false }, 'Encryption is on')}>Turn on encryption</button><button class="btn ghost" onclick={() => (encConfirm = false)}>Cancel</button></div>
        {:else}
          <button class="btn ghost" onclick={() => (encConfirm = true)}><Icon name="shield" size={15} /> Turn on encryption…</button>
        {/if}
      {/if}
      {#if err}<p class="err" role="alert">{err}</p>{:else if note}<p class="ok" role="status">{note}</p>{/if}
    {/if}
    <h4 class="label">Notifications</h4>
    <div class="seg" role="radiogroup" aria-label="Notifications for this room">
      {#each [['all', 'All'], ['mentions', 'Mentions'], ['mute', 'Mute']] as [v, t] (v)}
        <button role="radio" aria-checked={level === v} class:on={level === v} onclick={() => pick(v as typeof level)}>{t}</button>
      {/each}
    </div>
    <h4 class="label">{chat.members.length} {chat.members.length === 1 ? 'member' : 'members'}</h4>
    <ul>
      {#each chat.members as m (m.id)}
        <li><button class="mrow" onclick={(e) => { const b = e.currentTarget.getBoundingClientRect(); ui.openUserCard(m.id, b.left, b.bottom + 4, e.currentTarget) }}><Avatar name={m.name} size={28} round src={m.avatar} presence={m.id === chat.userId ? chat.myStatus : chat.presenceOf(m.id)} /><span class="n">{m.name}</span>{#if m.level >= 50}<span class="role">{roleLabel(m.level)}</span>{/if}{#if m.id === chat.userId}<span class="mono you">you</span>{/if}</button></li>
      {/each}
    </ul>
    {#if chat.settings?.banned.length}
      <h4 class="label">Banned ({chat.settings.banned.length})</h4>
      <ul>
        {#each chat.settings.banned as b (b.id)}
          <li><span class="n" title={b.reason ?? ''}>{b.name}{#if b.reason}<small> · {b.reason}</small>{/if}</span>{#if chat.mayBan(b.id) || chat.settings.can.powerLevels}<button class="btn ghost sm" onclick={() => run(() => chat.unban(b.id))}>Unban</button>{/if}</li>
        {/each}
      </ul>
    {/if}
    <div class="actions">
      {#if confirm}
        <p>Leave {r.name}?</p>
        <button class="btn danger" onclick={() => chat.leaveRoom(r.id)}>Leave room</button>
        <button class="btn ghost" onclick={() => (confirm = false)}>Cancel</button>
      {:else}
        <button class="btn ghost" onclick={() => (confirm = true)}><Icon name="logout" size={15} /> Leave room</button>
      {/if}
      {#if reporting}
        <label class="set">Why are you reporting this room?<textarea bind:value={reason} rows="2" maxlength="500"></textarea></label>
        <button class="btn danger" disabled={!reason.trim()} onclick={() => run(async () => { await chat.reportRoom(reason); reporting = false; reason = '' }, 'Reported to your server administrators')}>Send report</button>
        <button class="btn ghost" onclick={() => (reporting = false)}>Cancel</button>
      {:else}
        <button class="btn ghost" onclick={() => (reporting = true)}><Icon name="alert" size={15} /> Report room</button>
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
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border-radius: 8px; background: var(--tile); } .seg button { border: 0; background: none; color: var(--muted); padding: 6px 0; border-radius: 6px; cursor: pointer; font: inherit; } .seg button.on { background: var(--panel); color: var(--text); box-shadow: 0 0 0 1px var(--line); }
  .edit { display: grid; gap: 10px; margin-bottom: 8px; } .edit label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); } .edit input, .edit textarea { font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; resize: vertical; } .edit .row { display: flex; gap: 8px; } .err { color: var(--danger); margin: 0; }
  .quiet { display: flex; gap: 10px; align-items: flex-start; margin: 12px 0 0; padding: 10px 12px; border-radius: 8px; background: var(--tile); cursor: pointer; } .quiet small { display: block; color: var(--muted); margin-top: 2px; } .quiet input { margin-top: 3px; }
  .actions { margin-top: 20px; display: grid; gap: 8px; } .actions p { margin: 0; } .btn { display: inline-flex; gap: 8px; align-items: center; justify-content: center; } .btn.danger { background: var(--danger); color: var(--bg); }
  .mrow { display: flex; align-items: center; gap: 10px; width: 100%; padding: 3px 4px; border-radius: 8px; text-align: left; } .mrow:hover { background: var(--tile); }
  .role { font-size: 11px; padding: 1px 6px; border-radius: 8px; background: var(--bg); color: var(--text); box-shadow: inset 0 0 0 1px var(--line); }
  .set { display: grid; gap: 4px; margin-top: 8px; font-size: 12px; color: var(--muted); } .set select, .set textarea { font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px; } .set select:disabled { opacity: .6; }
  .warn { margin: 8px 0; font-size: 13px; color: var(--danger); } .ok { margin: 6px 0 0; font-size: 12px; color: var(--ok); } .err { margin: 6px 0 0; font-size: 12px; color: var(--danger); } .sm { padding: 3px 10px; } small { color: var(--muted); }
</style>
