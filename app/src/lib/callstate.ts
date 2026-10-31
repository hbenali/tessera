// Pure helpers for the call screen. SDK-free.
export type CallPhase = 'ringing' | 'calling' | 'connecting' | 'connected' | 'ended'

/** m:ss, or h:mm:ss after an hour. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Map the SDK's call states (strings) to what the screen shows. */
export function phaseOf(state: string, incoming: boolean): CallPhase {
  switch (state) {
    case 'ringing': return 'ringing'
    case 'invite_sent': case 'wait_local_media': case 'create_offer': return incoming ? 'connecting' : 'calling'
    case 'create_answer': case 'connecting': return 'connecting'
    case 'connected': return 'connected'
    case 'ended': return 'ended'
    default: return incoming ? 'ringing' : 'calling'
  }
}

export const phaseLabel = (p: CallPhase, video: boolean, name: string): string =>
  p === 'ringing' ? `${name} is calling you${video ? ' (video)' : ''}` : p === 'calling' ? `Calling ${name}…` : p === 'connecting' ? 'Connecting…' : p === 'connected' ? `On a call with ${name}` : 'Call ended'

/** A friendly reason for a call that could not start or stopped, from the SDK's error code. */
export function whyEnded(code: string | undefined): string {
  switch (code) {
    case 'user_hangup': return ''
    case 'user_media_failed': return 'Tessera could not use your microphone or camera. Allow them for this site and try again.'
    case 'invite_timeout': return 'No answer'
    case 'ice_failed': return 'The connection failed. A TURN server on your homeserver may be needed to connect through firewalls.'
    case 'user_busy': return 'They are busy on another call'
    case 'unknown_device': return 'They are not signed in on a device that can take calls'
    case 'answered_elsewhere': return 'Answered on another device'
    case 'rejected': case 'user_rejected': return 'They declined the call'
    default: return code && code !== 'user_hangup' ? 'The call ended' : ''
  }
}

/** An incoming call is dropped when the caller is ignored; it rings silently during do not disturb. */
export const ringPolicy = (ignored: readonly string[], peer: string, dnd: boolean): 'reject' | 'silent' | 'ring' => (ignored.includes(peer) ? 'reject' : dnd ? 'silent' : 'ring')
