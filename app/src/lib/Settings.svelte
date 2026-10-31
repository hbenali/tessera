<script lang="ts">
  import Sessions from './Sessions.svelte'
  import KeyBackup from './KeyBackup.svelte'
  import AccountManage from './AccountManage.svelte'
  import Modal from './Modal.svelte'
  import { chat } from './matrix.svelte'
  import { security } from './security.svelte'
  import { THEMES, ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import About from './About.svelte'
  import { STYLES, beep, setSoundOn, setSoundStyle, soundOn, soundStyle, type Style } from './sound'
  import { install } from './install.svelte'
  import { loadPushConfig, pushSupported, type PushConfig } from './push'

  let tab = $state<'look' | 'security' | 'notify' | 'privacy' | 'sessions' | 'account' | 'about'>('security')
  let perm = $state(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  async function enableNotifications() {
    perm = await Notification.requestPermission()
  }
  // Background (web push) notifications need a push gateway named in this deployment's config.json.
  let pushCfg = $state<PushConfig | null | undefined>(undefined) // undefined: still looking
  let pushBusy = $state(false)
  let pushErr = $state('')
  let testSent = $state(false)
  const canPush = pushSupported()
  $effect(() => {
    loadPushConfig().then((c) => (pushCfg = c))
    chat.refreshPush()
  })
  async function togglePush() {
    pushErr = ''
    pushBusy = true
    try {
      if (chat.pushOn) await chat.disablePush()
      else {
        if (Notification.permission !== 'granted') perm = await Notification.requestPermission()
        await chat.enablePush(pushCfg!)
      }
    } catch (e) {
      pushErr = e instanceof Error ? e.message : 'Could not change background notifications'
    } finally {
      pushBusy = false
    }
  }
  async function testNotification() {
    testSent = true
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification('Tessera', { body: 'Notifications are working.', icon: '/icon-192.png', tag: 'tessera-test' })
  }
  let sound = $state(soundOn())
  let style = $state<Style>(soundStyle())
  let photo: HTMLInputElement | undefined = $state()
  let name = $state('')
  let profileErr = $state('')
  async function pickPhoto() {
    const f = photo?.files?.[0]
    if (!f) return
    profileErr = ''
    if (!f.type.startsWith('image/')) { profileErr = 'Choose an image file'; return }
    try { await chat.setMyAvatar(f) } catch (x) { profileErr = x instanceof Error ? x.message : 'Could not upload' }
  }
  async function saveName(e: Event) {
    e.preventDefault()
    profileErr = ''
    try { await chat.setMyName(name); name = '' } catch (x) { profileErr = x instanceof Error ? x.message : 'Could not save' }
  }
  let password = $state('')
  let recovery = $state('')
  $effect(() => { security.refresh() })
</script>

<Modal title="Settings" onclose={() => (ui.modal = null)}>
  <div class="tabs" role="tablist">
    {#each [['look', 'Appearance'], ['security', 'Security'], ['notify', 'Notifications'], ['privacy', 'Privacy'], ['sessions', 'Sessions'], ['account', 'Account'], ['about', 'About']] as [k, label] (k)}
      <button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k as typeof tab)}>{label}</button>
    {/each}
  </div>

  {#if tab === 'look'}
    <h3 class="label">Theme</h3>
    <div class="themes" role="radiogroup" aria-label="Theme">
      {#each THEMES as t (t.id)}
        <button class="theme" role="radio" aria-checked={ui.theme === t.id} class:on={ui.theme === t.id} onclick={() => ui.setTheme(t.id)}>
          <span class="swatch" style="background:{t.bg};color:{t.fg}"><i style="background:{t.ac}"></i><b>Aa</b></span>
          <span>{t.label}</span>
        </button>
      {/each}
    </div>
  {:else if tab === 'security'}
    <p class="status" class:ok={security.verified}>{security.verified ? 'This session is verified.' : 'This session is not verified.'}
      <span class="mono">Key backup {security.hasBackup ? 'on' : 'off'}</span></p>

    {#if security.generatedKey}
      <div class="key">
        <p><b>Save your recovery key.</b> It is shown once. Without it, encrypted history can be lost.</p>
        <code>{security.generatedKey}</code>
        <div class="row"><button class="btn ghost" onclick={() => navigator.clipboard.writeText(security.generatedKey)}>Copy</button>
          <button class="btn" onclick={() => (security.generatedKey = '')}>I have saved it</button></div>
      </div>
    {:else}
      <h3 class="label">Verify with another device</h3>
      <button class="btn" disabled={security.busy} onclick={() => security.requestVerification()}>Start verification</button>
      <h3 class="label">Restore with recovery key</h3>
      <form onsubmit={(e) => { e.preventDefault(); security.restore(recovery); recovery = '' }}>
        <input bind:value={recovery} placeholder="Recovery key" autocomplete="off" />
        <button class="btn" disabled={security.busy || !recovery}>Restore</button>
      </form>
      <h3 class="label">First time: set up encryption</h3>
      <form onsubmit={(e) => { e.preventDefault(); security.setup(password); password = '' }}>
        <input type="password" bind:value={password} placeholder="Account password" autocomplete="current-password" />
        <button class="btn" disabled={security.busy || !password}>Set up</button>
      </form>
    {/if}
    {#if security.message}<div class="err" role="alert">{security.message}</div>{/if}
  {:else if tab === 'notify'}
    <h3 class="label">Sound</h3>
    <div class="switches">
      <label class="switch"><span><b>Play a sound when a message arrives</b><small>Follows your notification settings: a muted room is silent, a room set to mentions only sounds only for a mention, and do not disturb or quiet hours silence it. A mention gets a longer sound. It is kept quiet and rare: one sound covers a burst, and a busy room sounds at most once a minute. Browsers allow sound only after you have clicked or typed in the page.</small></span>
        <input type="checkbox" role="switch" checked={sound} onchange={(e) => { sound = e.currentTarget.checked; setSoundOn(sound) }} /></label>
    </div>
    {#if sound}
      <div class="row soundrow">
        <div class="seg" role="radiogroup" aria-label="Sound">
          {#each STYLES as s (s.id)}
            <button role="radio" aria-checked={style === s.id} class:on={style === s.id} onclick={() => { style = s.id; setSoundStyle(s.id); beep('message', { force: true, style: s.id }) }}>{s.label}</button>
          {/each}
        </div>
        <button class="btn ghost" onclick={() => beep('message', { force: true, style })}>Play</button>
        <button class="btn ghost" onclick={() => beep('mention', { force: true, style })}>Play mention</button>
      </div>
    {/if}
    <h3 class="label">Do not disturb</h3>
    {#if chat.manualDnd}
      <p class="status ok">On {chat.dnd?.until ? `until ${new Date(chat.dnd.until).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'until you turn it off'}.</p>
      <button class="btn" onclick={() => chat.endDnd()}>Turn off</button>
    {:else}
      <p class="hint">Silence notifications for a while. Choose a duration from your name in the sidebar, or here.</p>
      <div class="row"><button class="btn ghost" onclick={() => chat.setDnd(Date.now() + 3600_000)}>1 hour</button><button class="btn ghost" onclick={() => chat.setDnd(Date.now() + 8 * 3600_000)}>8 hours</button><button class="btn ghost" onclick={() => chat.setDnd(null)}>Until I turn it off</button></div>
    {/if}
    <h3 class="label">Automatic reply</h3>
    <div class="switches">
      <label class="switch"><span><b>Reply when someone mentions me</b><small>While do not disturb or quiet hours are on, send the message below to anyone who tags you.</small></span>
        <input type="checkbox" role="switch" checked={chat.autoReply.enabled} onchange={(e) => chat.setAutoReply({ enabled: e.currentTarget.checked })} /></label>
    </div>
    {#if chat.autoReply.enabled}
      <label class="field">Message
        <textarea rows="3" maxlength="500" value={chat.autoReply.message} onchange={(e) => chat.setAutoReply({ message: e.currentTarget.value })}></textarea>
      </label>
      <label class="check"><input type="checkbox" checked={chat.autoReply.dms} onchange={(e) => chat.setAutoReply({ dms: e.currentTarget.checked })} /> Also reply to direct messages</label>
      <p class="hint">Use <span class="mono">{'{until}'}</span> for the time it ends, for example "Back at {'{until}'}." Sent as a notice, at most once per room every 6 hours, and never to another automatic message. It only works while Tessera is open on some device: Matrix has no server-side auto-reply.</p>
    {/if}
    <h3 class="label">Quiet hours</h3>
    <div class="switches">
      <label class="switch"><span><b>Do not disturb on a schedule</b><small>{chat.quietNow ? 'Quiet hours are on now.' : 'Silence notifications at fixed times, on the days you choose.'}</small></span>
        <input type="checkbox" role="switch" checked={chat.schedule.enabled} onchange={(e) => chat.setSchedule({ enabled: e.currentTarget.checked })} /></label>
    </div>
    {#if chat.schedule.enabled}
      <div class="days" role="group" aria-label="Days quiet hours start on">
        {#each [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']] as [d, label] (d)}
          <button class="day" class:on={chat.schedule.days.includes(d as number)} aria-pressed={chat.schedule.days.includes(d as number)}
            onclick={() => chat.setSchedule({ days: chat.schedule.days.includes(d as number) ? chat.schedule.days.filter((x) => x !== d) : [...chat.schedule.days, d as number] })}>{label}</button>
        {/each}
      </div>
      <div class="times">
        <label>From<input type="time" value={chat.schedule.from} onchange={(e) => e.currentTarget.value && chat.setSchedule({ from: e.currentTarget.value })} /></label>
        <label>Until<input type="time" value={chat.schedule.to} onchange={(e) => e.currentTarget.value && chat.setSchedule({ to: e.currentTarget.value })} /></label>
      </div>
      <p class="hint">{chat.schedule.from === chat.schedule.to ? 'The same start and end means the whole day.' : chat.schedule.to < chat.schedule.from ? 'Runs overnight: the end is the next morning.' : 'Starts and ends on the same day.'} The days are the days it starts on. Background notifications still arrive during quiet hours, silently, because browsers require every push to show something.</p>
    {/if}
    <p class="hint">Unread counts keep counting. If background notifications are on, the server is also told to stop sending while this is on, and it then does not count new messages as unread; everything else stays as it was.</p>
    <h3 class="label">Desktop notifications</h3>
    {#if perm === 'unsupported'}
      <p class="hint">This browser does not support notifications.</p>
    {:else if perm === 'granted'}
      <p class="status ok">Enabled. You will be notified of new messages while this tab is in the background.</p>
    {:else if perm === 'denied'}
      <p class="hint">Blocked in your browser settings. Allow notifications for this site, then reload.</p>
    {:else}
      <p class="hint">Get a notification when a message arrives in a room you are not looking at.</p>
      <button class="btn" onclick={enableNotifications}>Enable notifications</button>
    {/if}
    <h3 class="label">When Tessera is closed</h3>
    {#if !canPush}
      <p class="hint">This browser cannot receive background notifications.</p>
    {:else if pushCfg === undefined}
      <p class="hint">Checking…</p>
    {:else if pushCfg === null}
      <p class="hint">Background notifications need a push gateway, which this site has not set up. Notifications above still work while a Tessera tab is open. Whoever runs this site can follow docs/push.md.</p>
    {:else}
      <p class="status" class:ok={chat.pushOn}>{chat.pushOn ? 'On: you will be notified even when Tessera is closed.' : 'Off.'}</p>
      <p class="hint">Only the event id goes through the push gateway. The text is fetched from your homeserver by this browser, and not for encrypted rooms. Turning it on keeps your session available to this browser's background worker until you turn it off or sign out.</p>
      <div class="row">
        <button class="btn" disabled={pushBusy || perm === 'denied'} onclick={togglePush}>{chat.pushOn ? 'Turn off' : 'Turn on'}</button>
        {#if chat.pushOn}<button class="btn ghost" onclick={testNotification}>Send a test notification</button>{/if}
      </div>
      {#if perm === 'denied'}<p class="hint">Notifications are blocked in your browser settings for this site.</p>{/if}
      {#if testSent}<p class="hint" role="status">Sent. If nothing appeared, check your system's notification settings.</p>{/if}
      {#if pushErr}<div class="err" role="alert">{pushErr}</div>{/if}
    {/if}
    <h3 class="label">App</h3>
    {#if install.canInstall}
      <p class="hint">Install Tessera as an app with its own window and icon.</p>
      <button class="btn" onclick={() => install.ask()}>Install Tessera</button>
    {:else if install.installed}
      <p class="status ok">Installed.</p>
    {:else}
      <p class="hint">Your browser offers installing from its menu or address bar when this is supported.</p>
    {/if}
    <p class="hint">Message text is shown in the notification for unencrypted rooms and, once decrypted on this device, for encrypted ones. Notifications follow your Matrix push rules.</p>
  {:else if tab === 'privacy'}
    <h3 class="label">What others can see</h3>
    <div class="switches">
      <label class="switch"><span><b>Send typing notifications</b><small>People in the room see "… is typing" while you write.</small></span>
        <input type="checkbox" role="switch" checked={chat.privacy.typing} onchange={(e) => chat.setPrivacy({ typing: e.currentTarget.checked })} /></label>
      <label class="switch"><span><b>Send read receipts</b><small>People see that you have read their messages ("Seen"). When off, the server still clears your own unread count, and your other devices follow.</small></span>
        <input type="checkbox" role="switch" checked={chat.privacy.receipts} onchange={(e) => chat.setPrivacy({ receipts: e.currentTarget.checked })} /></label>
    </div>
    <p class="hint">Sending a message always shows that you were there. To read a single room without being seen, use <b>Read quietly</b> in its menu. Presence (online, away) is set from the sidebar.</p>
  {:else if tab === 'sessions'}
    <Sessions />
    <KeyBackup />
  {:else if tab === 'about'}
    <About />
  {:else}
    <div class="me">
      <Avatar name={chat.me.name || chat.userId} size={64} round src={chat.me.avatar} presence={chat.myStatus} />
      <div><b>{chat.me.name || chat.userId}</b><div class="hint mono">{chat.userId}</div></div>
    </div>
    <input type="file" accept="image/*" hidden bind:this={photo} onchange={pickPhoto} />
    <button class="btn ghost" onclick={() => photo?.click()}>Change photo</button>
    <form onsubmit={saveName}>
      <label class="grow">Display name<input bind:value={name} maxlength="80" placeholder={chat.me.name} /></label>
      <button class="btn" disabled={!name.trim() || name.trim() === chat.me.name}>Save</button>
    </form>
    {#if profileErr}<div class="err" role="alert">{profileErr}</div>{/if}
    <h3 class="label">Status</h3>
    <div class="seg" role="radiogroup" aria-label="Status">
      {#each [['online', 'Online'], ['unavailable', 'Away'], ['offline', 'Invisible']] as [v, t] (v)}
        <button role="radio" aria-checked={chat.myStatus === v} class:on={chat.myStatus === v} onclick={() => chat.setStatus(v as 'online')}>{t}</button>
      {/each}
    </div>
    <p class="hint">Invisible shows you as offline. Presence must be enabled on your homeserver for others to see it.</p>
    <h3 class="label">Session</h3>
    <button class="btn" onclick={() => chat.logout()}>Sign out</button>
    <AccountManage />
  {/if}
</Modal>

<style>
  /* Six tabs: one row when they fit, otherwise they wrap onto a second row. (Scrolling them sideways hid the last tab, About, on a phone.) */
  .tabs { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 16px; padding: 3px; background: var(--tile); border-radius: 8px; }
  .tabs button { flex: 1 1 auto; padding: 6px 8px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--muted); white-space: nowrap; } .tabs .on { background: var(--bg); color: var(--text); }
  .hint { color: var(--muted); font-size: 13px; }
  h3 { margin: 20px 0 8px; }
  .themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
  .theme { display: grid; gap: 6px; text-align: left; font-size: 13px; padding: 6px; border-radius: 8px; border: 2px solid transparent; } .theme.on { border-color: var(--accent); }
  .swatch { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-radius: 6px; border: 1px solid var(--line); } .swatch i { width: 14px; height: 14px; border-radius: 3px; } .swatch b { font-size: 18px; }
  .row { display: flex; gap: 10px; }
  .switches { display: grid; gap: 4px; } .switch { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line); cursor: pointer; } .switch small { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; max-width: 38ch; }
  .switch input[role=switch] { appearance: none; flex: none; width: 40px; height: 24px; border-radius: 999px; background: var(--tile); box-shadow: inset 0 0 0 1px var(--line); position: relative; cursor: pointer; transition: background .15s; } .switch input[role=switch]::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--muted); transition: transform .15s, background .15s; }
  .switch input[role=switch]:checked { background: var(--accent); } .switch input[role=switch]:checked::after { transform: translateX(16px); background: var(--accent-ink); } .switch input[role=switch]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .switch input[role=switch], .switch input[role=switch]::after { transition: none; } }
  .field { display: grid; gap: 4px; margin: 10px 0 6px; font-size: 12px; color: var(--muted); } .field textarea { font: inherit; font-size: 14px; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; resize: vertical; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 6px 0; }
  .soundrow { align-items: center; flex-wrap: wrap; margin-top: 10px; } .soundrow .seg { flex: 1 1 200px; }
  .days { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 4px; } .day { padding: 6px 11px; border-radius: 999px; background: var(--tile); color: var(--muted); font-size: 13px; font-weight: 500; box-shadow: inset 0 0 0 1px var(--line); } .day.on { background: var(--accent); color: var(--accent-ink); box-shadow: none; }
  .times { display: flex; gap: 14px; margin: 10px 0; } .times label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); } .times input { font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
  .me { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; } .grow { flex: 1; display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border-radius: 8px; background: var(--tile); } .seg button { padding: 6px 0; border-radius: 6px; color: var(--muted); } .seg button.on { background: var(--bg); color: var(--text); box-shadow: 0 0 0 1px var(--line); }
  .status { margin: 0; padding: 10px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; color: var(--danger); } .status.ok { color: var(--ok); } .status .mono { color: var(--muted); }
  form { display: flex; gap: 12px; align-items: end; }
  .key { padding: 14px 0; } code { display: block; word-break: break-all; margin: 10px 0 14px; padding: 12px; background: var(--tile); font-family: var(--mono); font-size: 13px; }
  .err { color: var(--danger); font-size: 13px; margin-top: 12px; }
</style>
