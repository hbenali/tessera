import { MENTION_ID, type MentionPill } from './mentions'
import { tone } from './ui.svelte'

/** Tiny, dependency-free renderer for the Markdown subset chat needs. Escapes first, so output is safe for {@html}. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface RenderOptions {
  /** Display name for a Matrix user id, if known. */
  name?: (id: string) => string | undefined
  me?: string
  /** People mentioned by name rather than by id (messages from other clients). */
  pills?: MentionPill[]
}


const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The pill for one person. The dot is the colour of their avatar tile; click or Enter opens their card (wired by the timeline). */
const pill = (id: string, label: string, me?: string) =>
  `<span class="mention${id === me ? ' me' : ''}" data-user="${id}" role="button" tabindex="0" aria-haspopup="dialog" title="${id}"><i style="background:var(--t${tone(label)})"></i>@${label.replace(/^@/, '')}</span>`

export function render(src: string, opts: RenderOptions = {}): string {
  const blocks: string[] = []
  // Fenced code first so its contents are not touched by inline rules.
  let s = esc(src.replace(/\u0000/g, '')).replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
    return `\u0000${blocks.length - 1}\u0000`
  })
  s = s
    .replace(/`([^`\n]+)`/g, (_, code) => {
      blocks.push(`<code>${code}</code>`)
      return `\u0000${blocks.length - 1}\u0000`
    })
    .replace(MENTION_ID, (_, pre, id) => {
      blocks.push(pill(id, esc(opts.name?.(id) ?? id), opts.me))
      return `${pre}\u0000${blocks.length - 1}\u0000`
    })
  // A person named in the text (the form other clients send): the name, with or without "@", at a word edge.
  for (const p of opts.pills ?? []) {
    const label = esc(p.label)
    s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}_@])@?${escapeRe(label)}(?![\\p{L}\\p{N}_])`, 'gu'), (_, pre: string) => {
      blocks.push(pill(p.id, label, opts.me))
      return `${pre}\u0000${blocks.length - 1}\u0000`
    })
  }
  s = s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
    .replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i])
}
