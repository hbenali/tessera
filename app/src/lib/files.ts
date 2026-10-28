/** Helpers for file attachments. Pure. */

/** "1.5 MB", "12 kB", "300 B". */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} kB`
  return `${bytes} B`
}

/**
 * A name that is safe to save under. The name comes from another person's message, so a path ("../../x"), control
 * characters, characters some systems reject, and a name that is only dots or empty are all made harmless.
 */
export function safeFileName(name: string | undefined, fallback = 'file'): string {
  const cleaned = (name ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '') // control characters and bidi overrides that disguise an extension
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/^[.\s]+/, '') // no hidden file, no ".."
    .replace(/[.\s]+$/, '')
    .slice(0, 120)
  return cleaned || fallback
}

/** The extension to show on the file tile: "txt", "pdf"; empty if there is none. */
export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/** A rough kind, for the tile colour and icon. */
export function kindOf(name: string, mimetype?: string): 'document' | 'archive' | 'code' | 'sheet' | 'video' | 'other' {
  const ext = extensionOf(name)
  const mime = mimetype ?? ''
  if (mime.startsWith('video/') || ['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) return 'video'
  if (['zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'bz2', 'xz'].includes(ext)) return 'archive'
  if (['csv', 'xls', 'xlsx', 'ods'].includes(ext)) return 'sheet'
  if (['js', 'ts', 'json', 'py', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'sh', 'yml', 'yaml', 'xml', 'html', 'css', 'sql', 'md'].includes(ext)) return 'code'
  if (['txt', 'pdf', 'doc', 'docx', 'odt', 'rtf', 'ppt', 'pptx', 'odp', 'log'].includes(ext) || mime.startsWith('text/') || mime === 'application/pdf') return 'document'
  return 'other'
}

const TYPE_NAMES: Record<string, string> = {
  txt: 'Plain text', log: 'Log file', md: 'Markdown', csv: 'CSV spreadsheet', json: 'JSON', xml: 'XML', yml: 'YAML', yaml: 'YAML', html: 'HTML', css: 'Stylesheet',
  pdf: 'PDF document', doc: 'Word document', docx: 'Word document', odt: 'OpenDocument text', rtf: 'Rich text', xls: 'Excel spreadsheet', xlsx: 'Excel spreadsheet',
  ods: 'OpenDocument spreadsheet', ppt: 'PowerPoint', pptx: 'PowerPoint', odp: 'OpenDocument presentation',
  zip: 'ZIP archive', gz: 'Gzip archive', tgz: 'Compressed tar archive', tar: 'Tar archive', '7z': '7-Zip archive', rar: 'RAR archive',
  js: 'JavaScript', ts: 'TypeScript', py: 'Python', go: 'Go source', rs: 'Rust source', java: 'Java source', c: 'C source', cpp: 'C++ source', sh: 'Shell script', sql: 'SQL',
  mp4: 'MP4 video', mov: 'QuickTime video', mkv: 'Matroska video', webm: 'WebM video', avi: 'AVI video',
}

/** A readable name for the kind of file: "PDF document", "Plain text". Falls back to the MIME type, then to nothing. */
export function typeLabel(name: string, mimetype?: string): string {
  const byExt = TYPE_NAMES[extensionOf(name)]
  if (byExt) return byExt
  const mime = (mimetype ?? '').split(';')[0].trim()
  if (mime === 'text/plain') return 'Plain text'
  if (mime && mime !== 'application/octet-stream') return mime
  return ''
}

/** "12,345 bytes", with the locale's separators, for the details. */
export const exactSize = (bytes: number | undefined): string => (bytes === undefined || !Number.isFinite(bytes) || bytes < 0 ? '' : `${bytes.toLocaleString()} ${bytes === 1 ? 'byte' : 'bytes'}`)
