import * as sdk from 'matrix-js-sdk'
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent'
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
} from 'matrix-js-sdk/lib/crypto-api/verification'
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key'

export type SasState = {
  emoji: [string, string][]
  confirm: () => Promise<void>
  mismatch: () => void
}

/** End-to-end encryption state: session trust, recovery key, backup and device verification. */
class Security {
  verified = $state(false)
  hasBackup = $state(false)
  busy = $state(false)
  message = $state('')
  generatedKey = $state('')
  request = $state<VerificationRequest | null>(null)
  phase = $state<VerificationPhase>(VerificationPhase.Unsent)
  sas = $state<SasState | null>(null)

  private client!: sdk.MatrixClient
  private password = ''
  private keyBytes: Uint8Array<ArrayBuffer> | null = null

  /** Passed to createClient: secret storage asks for its key through this. */
  callbacks: sdk.ICreateClientOpts['cryptoCallbacks'] = {
    getSecretStorageKey: async ({ keys }) => {
      const id = Object.keys(keys)[0]
      return this.keyBytes && id ? [id, this.keyBytes] : null
    },
    cacheSecretStorageKey: (_id, _info, key) => {
      this.keyBytes = key
    },
  }

  attach(client: sdk.MatrixClient) {
    this.client = client
    client.on(CryptoEvent.VerificationRequestReceived, (r) => this.track(r))
    client.on(CryptoEvent.UserTrustStatusChanged, () => this.refresh())
    client.on(CryptoEvent.KeyBackupStatus, () => this.refresh())
  }

  async refresh() {
    const crypto = this.client?.getCrypto()
    if (!crypto) return
    const status = await crypto.getUserVerificationStatus(this.client.getUserId()!)
    const dev = await crypto.getDeviceVerificationStatus(
      this.client.getUserId()!,
      this.client.getDeviceId()!,
    )
    this.verified = status.isCrossSigningVerified() && !!dev?.crossSigningVerified
    this.hasBackup = !!(await crypto.getKeyBackupInfo().catch(() => null))
  }

  private async run(label: string, fn: () => Promise<void>) {
    this.busy = true
    this.message = ''
    try {
      await fn()
      await this.refresh()
    } catch (e) {
      this.message = `${label}: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      this.busy = false
    }
  }

  /** Create cross-signing keys, secret storage and a key backup. Shows the recovery key once. */
  setup(password: string) {
    return this.run('Setup failed', async () => {
      const crypto = this.client.getCrypto()!
      this.password = password
      const key = await crypto.createRecoveryKeyFromPassphrase()
      this.keyBytes = key.privateKey
      const uia = async (makeRequest: (auth: never) => Promise<unknown>) => {
        await makeRequest({
          type: 'm.login.password',
          identifier: { type: 'm.id.user', user: this.client.getUserId() },
          password: this.password,
        } as never)
      }
      await crypto.bootstrapCrossSigning({ setupNewCrossSigning: true, authUploadDeviceSigningKeys: uia })
      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => key,
        setupNewKeyBackup: true,
        setupNewSecretStorage: true,
      })
      this.password = ''
      this.generatedKey = key.encodedPrivateKey ?? ''
    })
  }

  /** Unlock existing secret storage with a recovery key; trusts this session and restores room keys. */
  restore(recoveryKey: string) {
    return this.run('Restore failed', async () => {
      const crypto = this.client.getCrypto()!
      this.keyBytes = decodeRecoveryKey(recoveryKey.replace(/\s+/g, ''))
      await crypto.bootstrapCrossSigning({})
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage()
      await crypto.restoreKeyBackup()
      await crypto.crossSignDevice(this.client.getDeviceId()!)
    })
  }

  /** Ask another signed-in session to verify this one with emojis. */
  async requestVerification() {
    await this.run('Verification request failed', async () => {
      this.track(await this.client.getCrypto()!.requestOwnUserVerification())
    })
  }

  private track(req: VerificationRequest) {
    this.request = req
    this.phase = req.phase
    this.sas = null
    const onChange = () => {
      this.phase = req.phase
      if (req.phase === VerificationPhase.Requested && !req.initiatedByMe) return
      if (req.phase === VerificationPhase.Ready && req.initiatedByMe && !req.verifier) {
        req.startVerification('m.sas.v1').then((v) => this.watch(v)).catch((e) => (this.message = String(e)))
      }
      if (req.verifier && !this.sas) this.watch(req.verifier)
      if (req.phase === VerificationPhase.Done || req.phase === VerificationPhase.Cancelled) {
        this.sas = null
        this.refresh()
      }
    }
    req.on(VerificationRequestEvent.Change, onChange)
    onChange()
  }

  private watched = new WeakSet<object>()
  private watch(v: NonNullable<VerificationRequest['verifier']>) {
    if (this.watched.has(v)) return
    this.watched.add(v)
    const show = (s: ShowSasCallbacks) => {
      this.sas = { emoji: (s.sas.emoji ?? []) as [string, string][], confirm: () => s.confirm(), mismatch: () => s.mismatch() }
    }
    v.on(VerifierEvent.ShowSas, show)
    if (v.getShowSasCallbacks()) show(v.getShowSasCallbacks()!)
    v.verify().catch(() => {})
  }

  accept() {
    return this.request?.accept()
  }
  cancel() {
    this.request?.cancel().catch(() => {})
    this.request = null
    this.sas = null
  }
  dismiss() {
    this.request = null
    this.sas = null
    this.generatedKey = ''
  }
}

export const security = new Security()
