/** Tiny, dependency-free renderer for the Markdown subset chat needs. Escapes first, so output is safe for {@html}. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function render(src: string): string {
  const blocks: string[] = []
  // Fenced code first so its contents are not touched by inline rules.
  let s = esc(src).replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
    return `\u0000${blocks.length - 1}\u0000`
  })
  s = s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
    .replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i])
}
