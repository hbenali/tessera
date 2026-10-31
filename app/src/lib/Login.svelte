<script lang="ts">
  import Avatar from './Avatar.svelte'
  import { loginOptions, probeRegistration, registerAccount, startSso, type LoginOptions, type RegisterProbe } from './discover'
  type Mod = typeof import('./matrix.svelte')
  let { load }: { load: () => Promise<Mod> } = $props()
  let error = $state('')
  // The public homeserver most people have an account on; remembered once you sign in somewhere else.
  const DEFAULT_SERVER = 'matrix.org'
  const remembered = (() => { try { return localStorage.getItem('tessera.server') } catch { return null } })()
  let server = $state(remembered || DEFAULT_SERVER)
  let user = $state('')
  let password = $state('')
  let busy = $state(false)
  let options = $state<LoginOptions | null>(null)
  let probing: ReturnType<typeof setTimeout> | undefined

  // Ask the homeserver how people can sign in, once the address stops changing.
  function probe() {
    clearTimeout(probing)
    options = null
    if (server.trim().length < 4) return
    probing = setTimeout(async () => {
      try { options = await loginOptions(server) } catch { options = null }
    }, 500)
  }
  probe()

  let mode = $state<'in' | 'up'>('in')
  let token = $state('')
  let again = $state('')
  let signup = $state<RegisterProbe | null>(null)
  let upTimer: ReturnType<typeof setTimeout> | undefined
  async function chooseUp() {
    mode = 'up'; error = ''; signup = null
    try { signup = await probeRegistration(options?.baseUrl ?? (await (await import('./discover')).discover(server))) } catch { signup = { closed: 'Could not reach that homeserver' } }
  }
  async function submitUp(e: Event) {
    e.preventDefault()
    if (!signup || 'closed' in signup) return
    error = ''
    if (password !== again) { error = 'The passwords differ'; return }
    busy = true
    try {
      const baseUrl = options?.baseUrl ?? (await (await import('./discover')).discover(server))
      const s = await registerAccount(baseUrl, user.trim().toLowerCase(), password, signup.plan, signup.session, token)
      localStorage.setItem('tessera.server', server)
      const { chat } = await load()
      await chat.adopt(s)
      error = chat.error
    } catch (x) { error = x instanceof Error ? x.message : String(x) }
    busy = false
  }

  async function submit(e: Event) {
    e.preventDefault()
    busy = true
    localStorage.setItem('tessera.server', server)
    const { chat } = await load()
    await chat.login(server, user, password)
    error = chat.error
    busy = false
  }
</script>

<main>
  <section class="card">
    <div class="brand"><Avatar name="Tessera" size={40} /><span>Tessera</span></div>
    <h1>{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
    <p class="lede">Use your Matrix account on any homeserver.</p>
    {#if options?.sso.length}
      <div class="sso">
        {#each options.sso as p (p.id)}<button type="button" class="btn ghost" onclick={() => startSso(options!.baseUrl, p.id)}>Continue with {p.name}</button>{/each}
      </div>
      {#if options.password}<div class="or"><span>or use a password</span></div>{/if}
    {/if}
    {#if mode === 'up'}
      <form onsubmit={submitUp}>
        <label>Homeserver<input bind:value={server} oninput={() => { probe(); signup = null; clearTimeout(upTimer); upTimer = setTimeout(chooseUp, 600) }} placeholder="matrix.example.org" required /></label>
        {#if signup && 'closed' in signup}<p class="err" role="alert">{signup.closed}</p>{/if}
        {#if !signup}<p class="lede">Checking the homeserver…</p>{/if}
        {#if signup && 'plan' in signup}
          <label>Username<input bind:value={user} autocomplete="username" required /></label>
          <label>Password<input type="password" bind:value={password} autocomplete="new-password" minlength="8" required /></label>
          <label>Repeat the password<input type="password" bind:value={again} autocomplete="new-password" required /></label>
          {#if signup.plan.needsToken}<label>Registration token<input bind:value={token} autocomplete="off" required /></label>{/if}
          {#if error}<div class="err" role="alert">{error}</div>{/if}
          <button class="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        {/if}
      </form>
      <p class="switchmode">Already have one? <button type="button" class="link" onclick={() => { mode = 'in'; error = '' }}>Sign in</button></p>
    {:else if !options || options.password}
    <form onsubmit={submit}>
      <label>Homeserver<input bind:value={server} oninput={probe} placeholder="matrix.example.org" required /></label>
      <label>Username<input bind:value={user} autocomplete="username" required /></label>
      <label>Password<input type="password" bind:value={password} autocomplete="current-password" required /></label>
      {#if error}<div class="err" role="alert">{error}</div>{/if}
      <button class="btn" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
    </form>
    {/if}
    {#if mode === 'in'}<p class="switchmode">New here? <button type="button" class="link" onclick={chooseUp}>Create an account</button></p>{/if}
  </section>
</main>

<style>
  main { min-height: 100%; display: grid; place-items: center; padding: 24px; background: var(--panel); }
  .card { width: min(400px, 100%); padding: 32px; background: var(--bg); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 18px; letter-spacing: -.02em; margin-bottom: 22px; }
  h1 { margin: 0; font-size: 24px; letter-spacing: -.02em; } .lede { margin: 4px 0 20px; color: var(--muted); }
  form { display: grid; gap: 14px; } label { display: grid; gap: 6px; font-size: 13px; font-weight: 500; }
  .sso { display: grid; gap: 8px; margin-bottom: 14px; } .sso .btn { padding: 10px; }
  .or { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; color: var(--muted); font-size: 12px; } .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .btn { padding: 10px; margin-top: 4px; } .err { color: var(--danger); font-size: 13px; }
  .switchmode { margin: 16px 0 0; text-align: center; color: var(--muted); font-size: 13px; } .link { color: var(--accent); text-decoration: underline; }
</style>
