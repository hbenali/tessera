<script lang="ts">
  import Avatar from './Avatar.svelte'
  import { loginOptions, startSso, type LoginOptions } from './discover'
  type Mod = typeof import('./matrix.svelte')
  let { load }: { load: () => Promise<Mod> } = $props()
  let error = $state('')
  let server = $state(localStorage.getItem('tessera.server') ?? 'http://localhost:8008')
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
    <h1>Sign in</h1>
    <p class="lede">Use your Matrix account on any homeserver.</p>
    {#if options?.sso.length}
      <div class="sso">
        {#each options.sso as p (p.id)}<button type="button" class="btn ghost" onclick={() => startSso(options!.baseUrl, p.id)}>Continue with {p.name}</button>{/each}
      </div>
      {#if options.password}<div class="or"><span>or use a password</span></div>{/if}
    {/if}
    {#if !options || options.password}
    <form onsubmit={submit}>
      <label>Homeserver<input bind:value={server} oninput={probe} placeholder="matrix.example.org" required /></label>
      <label>Username<input bind:value={user} autocomplete="username" required /></label>
      <label>Password<input type="password" bind:value={password} autocomplete="current-password" required /></label>
      {#if error}<div class="err" role="alert">{error}</div>{/if}
      <button class="btn" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
    </form>
    {/if}
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
</style>
