<script lang="ts">
  import Modal from './Modal.svelte'
  import { security } from './security.svelte'
  import { VerificationPhase as P } from 'matrix-js-sdk/lib/crypto-api/verification'
</script>

{#if security.request}
  <Modal title="Verify session" onclose={() => security.cancel()}>
    {#if security.sas}
      <p>Check that these symbols match on your other device.</p>
      <div class="emoji">{#each security.sas.emoji as [e, n] (n)}<div><span>{e}</span><small class="mono">{n}</small></div>{/each}</div>
      <div class="row"><button class="btn" onclick={() => security.sas?.confirm()}>They match</button><button class="btn ghost" onclick={() => security.sas?.mismatch()}>They do not</button></div>
    {:else if security.phase === P.Requested && !security.request.initiatedByMe}
      <p>Another session is asking to verify.</p>
      <div class="row"><button class="btn" onclick={() => security.accept()}>Accept</button><button class="btn ghost" onclick={() => security.cancel()}>Decline</button></div>
    {:else if security.phase === P.Done}
      <p>Verified.</p><button class="btn" onclick={() => security.dismiss()}>Done</button>
    {:else if security.phase === P.Cancelled}
      <p>Verification was cancelled.</p><button class="btn" onclick={() => security.dismiss()}>Close</button>
    {:else}
      <p>Waiting for the other device. Open another client and accept the request.</p>
    {/if}
  </Modal>
{/if}

<style>
  .emoji { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 8px; text-align: center; margin: 18px 0 22px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 16px 0; }
  .emoji span { font-size: 30px; display: block; } small { color: var(--muted); }
  .row { display: flex; gap: 10px; }
</style>
