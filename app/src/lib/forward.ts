// What may be copied into another room when forwarding a message. SDK-free.
export type Forward = { content: Record<string, unknown> } | { error: string }

const stripReply = (body: string): string => {
  if (!body.startsWith('> ')) return body
  const lines = body.split('\n')
  let i = 0
  while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) i++
  while (i < lines.length && lines[i] === '') i++
  return lines.slice(i).join('\n')
}

/**
 * Copy a message for another room. Replies, threads, edit markers and mentions stay behind (a copied mention would notify
 * people about a message that was never meant for them). An encrypted attachment carries its decryption key in the event, so
 * it must never be put in a room that is not encrypted: the homeserver would be handed the key to a file it already stores.
 */
export function forwardContent(src: Record<string, unknown>, targetEncrypted: boolean): Forward {
  if (src.file && !targetEncrypted) return { error: 'This file is encrypted. It cannot be forwarded into a room that is not encrypted, because that would give the server the key to it.' }
  const content: Record<string, unknown> = { ...src }
  for (const k of ['m.relates_to', 'm.new_content', 'm.mentions', 'formatted_body', 'format']) delete content[k]
  if (typeof content.body === 'string') content.body = stripReply(content.body)
  return { content }
}
