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
  /** The code the other device scans, once the request is ready and this device can show one. */
  qr = $state<Uint8ClampedArray | null>(null)
  /** The other device scanned our code: ask the person to confirm it says so. */
  reciprocate = $state<{ confirm: () => void; cancel: () => void } | null>(null)
  scanError = $state('')

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
    this.qr = null
    this.reciprocate = null
    this.scanError = ''
    let qrAsked = false
    const onChange = () => {
      this.phase = req.phase
      if (req.phase === VerificationPhase.Requested && !req.initiatedByMe) return
      // Ready is reported several times, and the SDK moves the request on each time it makes a code, so ask once.
      if (req.phase === VerificationPhase.Ready && !req.verifier && !qrAsked) {
        qrAsked = true
        // Offer a QR code to scan; the person can still choose emoji instead.
        this.qrPending = req.generateQRCode().then((q) => { if (this.request === req && req.phase === VerificationPhase.Ready) this.qr = q ?? null }, () => {})
      }
      if (req.phase !== VerificationPhase.Ready) this.qr = null
      if (req.verifier && !this.sas) this.watch(req.verifier)
      if (req.phase === VerificationPhase.Done || req.phase === VerificationPhase.Cancelled) {
        this.sas = null
        this.reciprocate = null
        // The new trust arrives with the next key query, a moment after Done; look again a few times.
        this.refresh()
        for (const ms of [800, 2500, 7000]) setTimeout(() => this.refresh(), ms)
      }
    }
    req.on(VerificationRequestEvent.Change, onChange)
    onChange()
  }

  /** The QR code being made; starting emoji verification waits for it, or the two fight over the request. */
  private qrPending: Promise<void> = Promise.resolve()
  private watched = new WeakSet<object>()
  private watch(v: NonNullable<VerificationRequest['verifier']>) {
    if (this.watched.has(v)) return
    this.watched.add(v)
    const show = (s: ShowSasCallbacks) => {
      this.sas = { emoji: (s.sas.emoji ?? []) as [string, string][], confirm: () => s.confirm(), mismatch: () => s.mismatch() }
    }
    v.on(VerifierEvent.ShowSas, show)
    const reciprocate = (c: { confirm: () => void; cancel: () => void }) => {
      this.reciprocate = { confirm: () => { this.reciprocate = null; c.confirm() }, cancel: () => { this.reciprocate = null; c.cancel() } }
    }
    v.on(VerifierEvent.ShowReciprocateQr, reciprocate)
    const waiting = v.getReciprocateQrCodeCallbacks()
    if (waiting) reciprocate(waiting)
    if (v.getShowSasCallbacks()) show(v.getShowSasCallbacks()!)
    v.verify().catch(() => {})
  }

  /** Compare emoji instead of scanning. */
  startEmoji() {
    this.qrPending
      .then(() => this.request?.startVerification('m.sas.v1'))
      .then((v) => v && this.watch(v))
      .catch((e) => (this.scanError = String(e instanceof Error ? e.message : e)))
  }

  /** Bytes read from the other device's QR code, by camera or from an image. */
  async scan(bytes: Uint8ClampedArray) {
    this.scanError = ''
    try {
      this.watch(await this.request!.scanQRCode(bytes))
    } catch (e) {
      this.scanError = e instanceof Error ? e.message : String(e)
    }
  }

  accept() {
    return this.request?.accept()
  }
  cancel() {
    this.request?.cancel().catch(() => {})
    this.request = null
    this.sas = null
    this.qr = null
    this.reciprocate = null
  }
  dismiss() {
    this.request = null
    this.sas = null
    this.qr = null
    this.reciprocate = null
    this.generatedKey = ''
  }
}

export const security = new Security()
