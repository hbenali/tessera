<script lang="ts">
  import Login from './lib/Login.svelte'
  import { install } from './lib/install.svelte'

  // The Matrix SDK and crypto module are large, so they load only once someone
  // signs in or a saved session needs resuming. The login page stays tiny.
  type Mod = typeof import('./lib/matrix.svelte')
  let mod = $state<Mod | null>(null)
  const load = async () => (mod ??= await import('./lib/matrix.svelte'))
  const shell = () => import('./lib/Shell.svelte')

  // Resume a saved session, or finish an SSO redirect that landed with ?loginToken=.
  const resuming = (() => {
    try {
      return !!localStorage.getItem('tessera.session') || new URL(location.href).searchParams.has('loginToken')
    } catch {
      return false
    }
  })()
  if (resuming) {
    load().then(async ({ chat }) => {
      const handled = await chat.finishSso()
      const saved = chat.loadSession()
      if (!handled && saved) chat.start(saved)
    })
  }
  const loggedIn = $derived(!!mod?.chat.userId)
</script>

{#if install.updated}
  <div class="update" role="status">A new version of Tessera is ready. <button onclick={() => location.reload()}>Reload</button></div>
{/if}

{#if loggedIn}
  {#await shell() then { default: Shell }}
    <Shell />
  {/await}
{:else if !resuming}
  <Login {load} />
{:else}
  <div class="boot" role="status" aria-live="polite">Loading…</div>
{/if}

<style>
  .update { position: fixed; z-index: 40; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-radius: 10px; background: var(--text); color: var(--bg); box-shadow: var(--shadow); font-size: 14px; }
  .update button { font-weight: 700; text-decoration: underline; color: inherit; }
  .boot { height: 100%; display: grid; place-items: center; color: var(--muted); }
</style>
