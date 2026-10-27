# Tessera

A fast, modern Matrix client for Synapse. Svelte 5 + Vite + TypeScript on `matrix-js-sdk`.

**Milestone 1 (core chat):** password login, spaces rail, channels and DMs with unread badges, timeline with grouping, replies, edits, reactions, image/file upload, typing indicators, Ctrl+K jump palette, dark/light theme, responsive layout.

**Not yet:** end-to-end encryption (milestone 2), SSO, threads, push notifications, PWA install.

## Develop

```sh
cd app
npm install
npm run dev      # http://localhost:5173
npm run check    # svelte-check + tsc
npm run build
```

Sign in with a full homeserver URL (e.g. `http://localhost:8008`) or a bare domain (resolved via `.well-known`).
