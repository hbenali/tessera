<script lang="ts">
  import Login from './lib/Login.svelte'

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
  .boot { height: 100%; display: grid; place-items: center; color: var(--muted); }
</style>
