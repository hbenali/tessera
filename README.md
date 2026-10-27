# Tessera

[![CI](https://github.com/hbenali/tessera/actions/workflows/ci.yml/badge.svg)](https://github.com/hbenali/tessera/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A fast, private, workspace-style [Matrix](https://matrix.org) client for Synapse and any other homeserver. It runs entirely in the browser and installs as a PWA. Built with Svelte 5, Vite and TypeScript on `matrix-js-sdk`, with the Rust crypto module for end-to-end encryption.

**Live:** <https://tessera.hbenali.ovh> (sign in with your own homeserver; nothing is stored on the server that hosts the app).

> Status: early, usable, not audited. It is a personal project and has been tested against one Synapse (1.118) and one real browser (Chrome). Do not rely on it as your only client for anything critical yet.

## Why

- **Fast and light.** The sign-in page is about 32 KiB; the Matrix SDK and crypto WASM load only after you sign in. Long rooms use CSS `content-visibility`.
- **Workspace feel.** One menu switches between views (All, Unread, Mentions, Favourites, People, Rooms) and spaces; threads in a side panel, pinned messages, per-room notification levels, a Ctrl K switcher.
- **Simple.** One list of conversations with previews, unread filters and no settings maze.
- **Eight themes**, including a high-contrast one, chosen from Settings.

## What works

- **Sign in:** password, or single sign-on when the homeserver offers it. Bare domains resolve through `.well-known`; the form starts on `matrix.org`.
- **Conversations:** a room menu (right-click, the more button or Shift+F10) with mark as read, mute, mentions only, favourite, copy link, details and leave; room list with avatars, previews, times, unread badges, muted and favourite markers, and animated typing; views and spaces from one menu; invitations; direct messages with user-directory search; join by address; leave; edit a room's name, topic and photo.
- **Presence:** online and away dots on avatars, your own status (Online, Away, Invisible) from the sidebar, and your own avatar and name, which you can change in Settings.
- **Messages:** sending, sent and seen marks on your messages; hover a reaction to see who reacted (click your own to take it back); Copy link on any message; Markdown subset (escaped first, so safe by construction), replies, edits, deletes, reactions with an emoji picker, image and file upload (also by paste or drag and drop), typing indicators, day dividers, history on scroll, "Seen" receipts, per-room drafts (kept across a reload only in unencrypted rooms, never written to disk for encrypted ones).
- **Mentions:** `@` autocomplete, mention pills, highlighted messages, and structured `m.mentions` so people are notified reliably.
- **Threads, pins and search:** reply in a thread with live updates; pin and unpin messages with a pin bar; Ctrl K searches rooms, the homeserver's index for older messages, and what is loaded on the device (the only way to search inside encrypted rooms).
- **Links:** the open room is in the address bar (`#/room/<id>`), so reload, Back and Forward work and a message link opens at that message.
- **End-to-end encryption:** encrypted rooms and DMs, cross-signing, secret storage and key backup, restore from a recovery key, verification by QR code (show, scan with the camera or from a screenshot) or by emoji.
- **Notifications:** desktop notifications that follow your push rules, an unread count in the tab title, and a per-room level (all, mentions, mute) stored as standard push rules so other clients agree.
- **Installable:** web app manifest and an offline-shell service worker.

## Not yet

Voice and video calls, search inside encrypted rooms beyond what the device has loaded, and a true timeline virtualiser.

Known gaps in what has been verified: single sign-on was only exercised against a stand-in identity provider, not a real one; QR scanning was tested with a screenshot of the code between two sessions, not a live camera; desktop notification pop-ups were not exercised (the unread count was); and accessibility has been checked with automated tools only (see below).

## Accessibility

axe-core (WCAG 2.1 A and AA) reports no violations in each theme (System follows dark or light) across the room, details, thread, pin and settings views, and this runs in CI. Lighthouse scores 100 for Performance, Accessibility and Best Practices on the sign-in page. Automated tools cannot show RGAA or WCAG conformity on their own: a manual keyboard and screen-reader review is still needed.

## Develop

```sh
cd app
npm install
npm run dev      # http://localhost:5173
npm run check    # svelte-check + tsc
npm test         # vitest
npm run build
npm run e2e      # real Chrome against a local Synapse (see below)
```

For local testing, run a Synapse (`matrixdotorg/synapse`) with the `rc_*` rate limits relaxed.

### Browser tests

`npm run e2e` drives the installed Google Chrome (via `playwright-core`; nothing is downloaded) against the production build, served with `vite preview`. Each run creates two throwaway users and a seeded room (mentions, an image, a reaction, 45 older messages), then checks the things that broke before: the composer staying on screen, scrolling from the top of a long room, the hover toolbar and emoji picker not being clipped, avatars and authenticated images loading, mention pills, pins, receipts, drafts, paste, per-room notification push rules, a phone-sized screen, no SDK in the sign-in bundle, and axe in every theme. CI runs it against a throwaway Synapse on every push.

```sh
npm run build
SYNAPSE_URL=http://localhost:8008 \
SYNAPSE_REGISTRATION_SECRET=...   \  # registration_shared_secret from homeserver.yaml; omit if registration is open
npm run e2e
```

Set `TESSERA_URL` to test an already running instance instead of `vite preview`.

## Deploy

**Docker (recommended).** Unprivileged nginx serving the static build with a strict Content Security Policy and security headers:

```sh
docker build -t tessera .
docker run -p 8080:8080 tessera
```

**GitHub Pages.** `.github/workflows/pages.yml` builds and deploys on every push to `main`; `app/public/CNAME` holds the custom domain. Pages cannot send response headers, so that build embeds the Content-Security-Policy as a `<meta>` tag instead (the browser suite passes under it). One difference: `frame-ancestors` cannot be set from a meta tag, so a Pages deployment can be framed by other sites. Prefer the Docker image if that matters to you.

Either way the app holds no secrets or state: the browser talks to your homeserver directly, so the homeserver must allow the origin where Tessera is hosted (Synapse does by default).

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability. Messages are rendered with an escaping Markdown renderer covered by XSS regression tests; the session, including the access token, is kept in the browser's `localStorage` and is only sent to your homeserver (so an XSS bug would be serious, which is why the CSP is strict).

## License

[MIT](LICENSE).
