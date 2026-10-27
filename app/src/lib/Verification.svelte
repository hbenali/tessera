<script lang="ts">
  import Modal from './Modal.svelte'
  import { security } from './security.svelte'
  import { VerificationPhase as P } from 'matrix-js-sdk/lib/crypto-api/verification'
</script>

{#if security.request}
  <Modal title="Verify session" onclose={() => security.cancel()}>
    {#if security.sas}
      <p>Check that these emoji match on your other device.</p>
      <div class="emoji">{#each security.sas.emoji as [e, n] (n)}<div><span>{e}</span><small>{n}</small></div>{/each}</div>
      <div class="row"><button class="primary" onclick={() => security.sas?.confirm()}>They match</button><button class="ghost" onclick={() => security.sas?.mismatch()}>They don’t</button></div>
    {:else if security.phase === P.Requested && !security.request.initiatedByMe}
      <p>Another session is asking to verify.</p>
      <div class="row"><button class="primary" onclick={() => security.accept()}>Accept</button><button class="ghost" onclick={() => security.cancel()}>Decline</button></div>
    {:else if security.phase === P.Done}
      <p>✓ Verified.</p><button class="primary" onclick={() => security.dismiss()}>Done</button>
    {:else if security.phase === P.Cancelled}
      <p>Verification was cancelled.</p><button class="primary" onclick={() => security.dismiss()}>Close</button>
    {:else}
      <p>Waiting for the other device… open Tessera or another client and accept the request.</p>
    {/if}
  </Modal>
{/if}

<style>
  .emoji { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center; margin: 14px 0; } .emoji span { font-size: 32px; display: block; } small { color: var(--muted); font-size: 11px; }
  .row { display: flex; gap: 8px; } .primary { padding: 9px 16px; border-radius: 10px; background: var(--accent); color: #1a1208; font-weight: 600; } .ghost { padding: 9px 16px; border-radius: 10px; background: var(--tile); }
</style>
