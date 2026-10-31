// 1:1 voice and video calls in direct chats, over the standard m.call.* events (so they work with Element and others).
import * as sdk from 'matrix-js-sdk'
import { CallErrorCode, CallEvent, CallState, CallType, createNewMatrixCall, type MatrixCall } from 'matrix-js-sdk/lib/webrtc/call'
import { CallEventHandlerEvent } from 'matrix-js-sdk/lib/webrtc/callEventHandler'
import { beep } from './sound'
import { phaseOf, ringPolicy, whyEnded, type CallPhase } from './callstate'

export interface ActiveCall {
  roomId: string
  peer: string
  incoming: boolean
  video: boolean
  phase: CallPhase
  micMuted: boolean
  camOff: boolean
  startedAt: number | null
  note: string
}

class Calls {
  active = $state<ActiveCall | null>(null)
  remote = $state.raw<MediaStream | null>(null)
  local = $state.raw<MediaStream | null>(null)
  private call: MatrixCall | null = null
  private client: sdk.MatrixClient | null = null
  private ring: ReturnType<typeof setInterval> | undefined

  /** Set by the app: is do not disturb on right now? */
  dnd: () => boolean = () => false

  attach(client: sdk.MatrixClient) {
    this.client = client
    client.on(CallEventHandlerEvent.Incoming, (call) => this.take(call, true))
  }

  /** True when this browser and homeserver can make calls. */
  get supported(): boolean {
    return !!this.client?.supportsVoip() && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  }

  async place(roomId: string, video: boolean) {
    if (this.call || !this.client) return
    const call = createNewMatrixCall(this.client, roomId)
    if (!call) throw new Error('Calls are not available in this browser')
    this.take(call, false, video)
    try { await (video ? call.placeVideoCall() : call.placeVoiceCall()) } catch (e) { this.finish(e instanceof Error ? e.message : 'Could not start the call') }
  }

  private take(call: MatrixCall, incoming: boolean, video = call.type === CallType.Video) {
    if (this.call) { if (incoming) call.reject(); return } // already on a call: decline the second one
    const policy = incoming ? ringPolicy(this.client?.getIgnoredUsers() ?? [], call.getOpponentMember()?.userId ?? '', this.dnd()) : 'ring'
    if (policy === 'reject') { call.reject(); return }
    this.call = call
    const peer = call.getOpponentMember()?.userId ?? ''
    this.active = { roomId: call.roomId, peer, incoming, video, phase: phaseOf(call.state, incoming), micMuted: false, camOff: false, startedAt: null, note: '' }
    if (incoming && policy === 'ring') {
      this.ring = setInterval(() => beep('mention', { force: true }), 2500)
      beep('mention', { force: true })
    }
    call.on(CallEvent.State, (state) => {
      if (!this.active) return
      this.active.phase = phaseOf(state, incoming)
      if (state === CallState.Connected && !this.active.startedAt) { this.active.startedAt = Date.now(); this.stopRing() }
      this.streams()
    })
    call.on(CallEvent.FeedsChanged, () => this.streams())
    call.on(CallEvent.Hangup, () => this.finish(whyEnded(call.hangupReason)))
    call.on(CallEvent.Error, (e) => this.finish(e.message))
  }

  private streams() {
    this.remote = this.call?.remoteUsermediaFeed?.stream ?? null
    this.local = this.call?.localUsermediaFeed?.stream ?? null
  }

  private stopRing() { clearInterval(this.ring); this.ring = undefined }

  async answer(video: boolean) {
    if (!this.call || !this.active) return
    this.stopRing()
    this.active.video = video
    try { await this.call.answer(true, video) } catch (e) { this.finish(e instanceof Error ? e.message : 'Could not answer') }
  }

  /** Decline an incoming call, or hang up one in progress. */
  hangup() {
    const c = this.call
    if (!c) return
    if (this.active?.incoming && this.active.phase === 'ringing') c.reject()
    else c.hangup(CallErrorCode.UserHangup, false)
    this.finish('')
  }

  async toggleMic() {
    if (!this.call || !this.active) return
    this.active.micMuted = await this.call.setMicrophoneMuted(!this.call.isMicrophoneMuted())
  }
  async toggleCamera() {
    if (!this.call || !this.active) return
    this.active.camOff = await this.call.setLocalVideoMuted(!this.call.isLocalVideoMuted())
  }

  private finish(note: string) {
    this.stopRing()
    if (!this.active) { this.call = null; return }
    this.active = { ...this.active, phase: 'ended', note }
    this.call = null
    this.remote = this.local = null
    setTimeout(() => { if (this.active?.phase === 'ended') this.active = null }, note ? 5000 : 800)
  }
}
export const calls = new Calls()
