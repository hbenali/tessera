// A room that mirrors a chat on another network (Slack, IRC, WhatsApp...), from its m.bridge state. SDK-free.
export interface Bridge { network: string; channel?: string; bot?: string }

interface Content { protocol?: { id?: string; displayname?: string }; channel?: { id?: string; displayname?: string }; bridgebot?: string }

/** The first usable bridge among a room's m.bridge / uk.half-shot.bridge state events. */
export function readBridge(contents: Content[]): Bridge | undefined {
  for (const c of contents) {
    const network = (c.protocol?.displayname ?? c.protocol?.id ?? '').toString().trim()
    if (!network) continue
    const channel = (c.channel?.displayname ?? '').toString().trim()
    return { network: network.slice(0, 40), channel: channel ? channel.slice(0, 60) : undefined, bot: typeof c.bridgebot === 'string' ? c.bridgebot : undefined }
  }
}

export const bridgeLabel = (b: Bridge): string => `Bridged to ${b.network}${b.channel ? ` · ${b.channel}` : ''}`
