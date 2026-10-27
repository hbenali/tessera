import { MENTION_ID } from './mentions'
import { tone } from './ui.svelte'

/** Tiny, dependency-free renderer for the Markdown subset chat needs. Escapes first, so output is safe for {@html}. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface RenderOptions {
  /** Display name for a Matrix user id, if known. */
  name?: (id: string) => string | undefined
  me?: string
}


export function render(src: string, opts: RenderOptions = {}): string {
  const blocks: string[] = []
  // Fenced code first so its contents are not touched by inline rules.
  let s = esc(src).replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
    return `\u0000${blocks.length - 1}\u0000`
  })
  s = s
    .replace(/`([^`\n]+)`/g, (_, code) => {
      blocks.push(`<code>${code}</code>`)
      return `\u0000${blocks.length - 1}\u0000`
    })
    .replace(MENTION_ID, (_, pre, id) => {
      const label = esc(opts.name?.(id) ?? id)
      // The dot is the colour of the person's avatar tile; click or Enter opens their card (wired up by the timeline).
      blocks.push(`<span class="mention${id === opts.me ? ' me' : ''}" data-user="${id}" role="button" tabindex="0" aria-haspopup="dialog" title="${id}"><i style="background:var(--t${tone(label)})"></i>@${label.replace(/^@/, '')}</span>`)
      return `${pre}\u0000${blocks.length - 1}\u0000`
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
    .replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i])
}
