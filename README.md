# Tessera

A fast, private Matrix client for Synapse and any Matrix homeserver. Svelte 5, Vite and TypeScript on `matrix-js-sdk`, with the Rust crypto module for end-to-end encryption.

## What works

- **Sign in:** password, or single sign-on when the homeserver offers it. Bare domains resolve through `.well-known`.
- **Conversations:** room list with previews, times, unread badges and All/Unread/People filters; spaces through a workspace switcher; invitations; direct messages with user-directory search; join by address; leave.
- **Threads and search:** reply in a thread with a side panel and live updates; Ctrl K searches rooms and loaded messages, including inside encrypted rooms, and jumps to the message.
- **Messages:** Markdown subset (safe by construction), replies, edits, deletes, reactions with an emoji picker, image and file upload, typing indicators, day dividers, history on scroll.
- **End-to-end encryption:** Rust crypto with IndexedDB stores, encrypted rooms and DMs, cross-signing, secret storage and key backup setup, restore from a recovery key, emoji (SAS) verification.
- **Notifications:** desktop notifications that follow your push rules, and an unread count in the tab title. Per-room level (all, mentions, mute) in the room details.
- **Installable:** web app manifest and an offline-shell service worker.
- **Themes:** System, Dark, Light, Midnight, Sand, Forest, Ocean and High contrast.
- **Accessibility:** axe-core reports no violations on any theme (room, details panel, settings). Full RGAA conformity also needs manual review.

## Not yet

Voice and video calls, QR verification, server-side search (search covers messages already loaded on the device), a full timeline virtualiser (long rooms use CSS `content-visibility` for now).

## Develop

```sh
cd app
npm install
npm run dev      # http://localhost:5173
npm run check    # svelte-check + tsc
npm test         # vitest
npm run build
```

For local testing, run a Synapse (`matrixdotorg/synapse`) with `enable_registration` on and the `rc_*` rate limits relaxed.

## Deploy

```sh
docker build -t tessera .
docker run -p 8080:8080 tessera
```

The image serves the static build with unprivileged nginx and a strict Content Security Policy. It holds no secrets or state: the browser talks to your homeserver directly, so the homeserver must allow the CORS origin where Tessera is hosted (Synapse does by default).

## Security

See [SECURITY.md](SECURITY.md). Messages are rendered with an escaping Markdown renderer covered by XSS regression tests.
