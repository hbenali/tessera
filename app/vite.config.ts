import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

// Same policy as security-headers.conf (nginx). Static hosts like GitHub Pages cannot send headers, so the
// Pages build puts it in a <meta> tag instead. frame-ancestors is not allowed in meta, nginx still sets it.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; " +
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
  build: { sourcemap: true },
})
