import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as { version: string }
const commit = (() => {
  if (process.env.TESSERA_COMMIT || process.env.GITHUB_SHA) return (process.env.TESSERA_COMMIT || process.env.GITHUB_SHA)!.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown' // a source archive or Docker build without git
  }
})()

// Same policy as security-headers.conf (nginx). Static hosts like GitHub Pages cannot send headers, so the
// Pages build puts it in a <meta> tag instead. frame-ancestors is not allowed in meta, nginx still sets it.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; media-src 'self' blob:; " +
  "connect-src 'self' https: http: wss: ws:; worker-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'self'"

const cspMeta = (): Plugin => ({
  name: 'tessera-csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    process.env.TESSERA_PAGES ? html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) : html,
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), cspMeta()],
  define: {
    __APP_VERSION__: JSON.stringify(json('./package.json').version),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __SDK_VERSION__: JSON.stringify(json('./node_modules/matrix-js-sdk/package.json').version),
  },
  build: { sourcemap: true },
})
