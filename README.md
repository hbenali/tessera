# Tessera

[![CI](https://github.com/hbenali/tessera/actions/workflows/ci.yml/badge.svg)](https://github.com/hbenali/tessera/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A fast, private, workspace-style [Matrix](https://matrix.org) client for Synapse and any other homeserver. It runs entirely in the browser and installs as a PWA. Built with Svelte 5, Vite and TypeScript on `matrix-js-sdk`, with the Rust crypto module for end-to-end encryption.

**Live:** <https://tessera.hbenali.ovh> (sign in with your own homeserver; nothing is stored on the server that hosts the app).

> Status: early, usable, not audited. It is a personal project and has been tested against one Synapse (1.118) and one real browser (Chrome). Do not rely on it as your only client for anything critical yet.

## Why

- **Fast and light.** The sign-in page is about 32 KiB; the Matrix SDK and crypto WASM load only after you sign in. Long rooms use CSS `content-visibility`.
- **Workspace feel.** One menu switches between views (All, Unread, Mentions, Favourites, People, Rooms) and spaces; threads in a side panel, pinned messages, per-room notification levels, a Ctrl K switcher.
- **Quick to appear.** A splash is in the first HTML, then an app-shaped skeleton and a thin sync bar instead of a blank "Loading…", and the app shell downloads alongside the Matrix SDK rather than after it.
- **Simple.** One list of conversations with previews, unread filters and no settings maze.
- **Eight themes**, including a high-contrast one, chosen from Settings.

## What works

- **Sign in:** password, or single sign-on when the homeserver offers it. Bare domains resolve through `.well-known`; the form starts on `matrix.org`.
- **Room list:** ordered by the latest real message (not state changes), favourites on top and low-priority rooms last, with a choice of latest activity, attention first (mentions, then unread) or A to Z; each row previews the last message (sender named in rooms, not in direct chats, reply quotes hidden, photos, videos, voice messages, files, polls and actions described) and shows an unsent draft in red.
- **Moderation and room settings:** click any member for a profile card with their role (Member, Moderator, Admin; you can only grant what you hold), Remove and Ban with a reason, and Ignore; banned people are listed with Unban; who can join (invite only, ask to join, public), who can read the history, turning on encryption (with a warning, it is permanent), and Report room to your server's administrators. Every control follows the room's power levels and is disabled or hidden when you may not use it.
- **More message actions:** a ⋯ button on every message: Forward to another room (replies and threads are left behind), View source (the event JSON, with the clear content of an encrypted one), Report to your homeserver's administrators, and, for moderators, Remove for everyone with a reason.
- **Sessions and account:** a Sessions tab lists every signed-in device (this one first, with last seen, verified and inactive marks), renames them and signs out one, several or all inactive ones (asking for your password when the server requires it); export and import room keys as an Element-compatible passphrase-protected file; change password, remove an email or phone, and deactivate the account.
- **Link previews:** a small card (title, description, picture) for the first link in a message, built by your homeserver. Never in encrypted rooms, never for private addresses, and switchable in Privacy.
- **Jump to:** a clock button in the room header goes to the first unread message or to the start of a chosen day (it pages back through history to get there).
- **Discovery and spaces:** an Explore tab searches the public room directory (add `@ other.server` to search another server's), joins open rooms and asks to join rooms that need approval, with a reason; create a space and add or remove a room from a space in its details.
- **Sign-up:** Create an account on homeservers that allow it with nothing or a registration token; if the server needs an email address, captcha or terms it says so and you create the account on its own site.
- **Polls, location, stickers:** create a poll (several answers or one, results hidden until it ends if you like) that others vote in and the author ends; share your location as a standard location message with a map link (no map tiles are loaded until you click); stickers from other clients are shown.
- **Mark as read and unread:** per room from its menu (Mark as read, or Mark as unread, which flags it with a dot and lists it under Unread, shared with other clients; opening the room clears it), and Mark all as read for everything in the current view from the view menu.
- **Notification keywords, low priority, density:** words that notify you in any room (standard content push rules, so other clients agree); Low priority in the room menu sinks a room to the bottom of the list (standard `m.lowpriority` tag); comfortable or compact messages and three text sizes in Appearance.
- **Languages:** English, French, Spanish and German, chosen from Settings or the browser's language. The sign-in page, sidebar, view and room menus, settings tabs and composer hint are translated; the rest is still English (a missing translation falls back to English, and a test keeps the three catalogs in step). The translations are mine and have not been reviewed by native speakers.
- **Calls:** voice and video calls in direct chats, over the standard `m.call.*` events (so they work with Element and other clients that still support them): ring, answer with or without video, decline, mute, camera off, a call timer, and a plain-language reason when a call fails. Tested between two real Chrome sessions with a fake camera and microphone on one machine; not tested over a network that needs a TURN server, with real devices, or with another client.
- **Conversations:** a room menu (right-click, the more button or Shift+F10) with mark as read, mute, mentions only, favourite, copy link, details and leave; room list with avatars, previews, times, unread badges, muted and favourite markers, and animated typing; views and spaces from one menu; invitations; direct messages with user-directory search; join by address; leave; edit a room's name, topic and photo.
- **Privacy:** switches for sending typing notifications and read receipts (off sends private receipts, so your own unread count still clears), plus per-room quiet reading below.
- **Do not disturb:** from your name in the sidebar for 30 minutes to until you turn it off, or recurring quiet hours on chosen days (overnight windows work). Optional automatic reply to anyone who mentions you, with your own text and the end time filled in; it is sent as a notice, once per room every 6 hours, and only while Tessera is open somewhere. Background pushes during quiet hours arrive silently because browsers require every push to show something.
- **About:** version, build, session and server details, a device fingerprint, update check and a copy-for-bug-report button (no secrets).
- **Quiet reading:** per room (room menu or details), read without showing anyone that you have. It sends a private read receipt, so your own unread count and other devices still update. Replying in the room still shows you were there.
- **Presence:** online and away dots on avatars, your own status (Online, Away, Invisible) from the sidebar, and your own avatar and name, which you can change in Settings.
- **Voice messages:** a mic button records (a live meter and timer, Esc to cancel, Enter to send, up to ten minutes) and sends a standard voice message other clients can play; received voice and audio messages, including those from Element, play in an inline player with a waveform, seeking and 1×/1.5×/2× speed.
- **Composer:** files wait in a tray with previews and upload progress until you send (several at once, by button, paste or drag and drop, with a drop target), a failed upload keeps its file and your text, formatting buttons and shortcuts (Ctrl+B, Ctrl+I, Ctrl+E, quote), `:emoji:` shortcodes, and slash commands: `/invite` (by id, short name or display name, with suggestions), `/me`, `/shrug`. A mistyped command is never sent to the room, and `//` sends a literal slash.
- **File attachments:** a received file (or video) is a card with its name, type and size and a Download button that saves the original, decrypting it first in an encrypted room; the info button shows the exact size, MIME type, who sent it and when, and whether it is encrypted. A name from another person is made safe before saving (no paths, control characters or disguised extensions), and a file is only ever saved, never opened. Captions are shown under the file.
- **Encrypted attachments:** in an encrypted room every file, image and voice message is encrypted in the browser before upload (the Matrix v2 attachment format: AES-256-CTR plus a SHA-256 check), so the homeserver only holds ciphertext, and received encrypted attachments are checked and decrypted.
- **Images:** click one to open a viewer with zoom (buttons, wheel, double-click, pinch, drag to pan), previous and next through the room's images, and a download button that saves the original file.
- **Messages:** sending, sent and seen marks on your messages, with each reader's avatar at the message they have read up to (click for everyone and when; "Seen 10:32" in direct chats); labelled hover actions; hover a reaction to see who reacted (click your own to take it back); Copy link on any message; Markdown subset (escaped first, so safe by construction), replies, edits, deletes, reactions with an emoji picker, image and file upload (also by paste or drag and drop), typing indicators, day dividers, history on scroll, "Seen" receipts, per-room drafts (kept across a reload only in unencrypted rooms, never written to disk for encrypted ones).
- **Sound:** a quiet sound when a message arrives (Chime, Blip or Pop, with a longer rise for a mention), off with one switch. It follows your notification settings: muted rooms are silent, mentions-only rooms sound only for a mention, and do not disturb and quiet hours silence it. One sound covers a burst (at most one every 8 seconds, 3 for a mention) and a busy room sounds at most once a minute.
- **Mentions from other clients:** people mentioned by link (Element and others write the name, with the Matrix id only in `formatted_body` or `m.mentions`) are drawn as pills too.
- **Mentions:** `@` autocomplete with presence, a mentioned person shown as a pill in the message box (the name is shown, the Matrix id is what is sent), mention pills with a colour dot (a stronger pill when it is you), a profile card from any pill or sender name (message, mention, copy ID), highlighted messages, and structured `m.mentions` so people are notified reliably.
- **Search in a room:** a header button (or Ctrl+Shift+F) opens a simple search of the room; Advanced adds who sent it, a date range, link, image or file, and mentions of you.
- **Threads, pins and search:** reply in a thread with live updates; pin and unpin messages with a pin bar; Ctrl K searches rooms, the homeserver's index for older messages, and what is loaded on the device (the only way to search inside encrypted rooms).
- **Links:** Tessera reopens the room you had open last time; the open room is in the address bar (`#/room/<id>`), so reload, Back and Forward work and a message link opens at that message.
- **End-to-end encryption:** encrypted rooms and DMs, cross-signing, secret storage and key backup, restore from a recovery key, verification by QR code (show, scan with the camera or from a screenshot) or by emoji.
- **Notifications:** desktop notifications that follow your push rules, an unread count and the open room's name in the tab title, and a per-room level (all, mentions, mute) stored as standard push rules so other clients agree.
- **Installable:** web app manifest with a maskable icon, an offline-shell service worker, an Install button in Settings and a "new version ready" prompt.
- **Background notifications:** optional web push through a Sygnal gateway you run, so you are notified with the app closed, with a picture that combines the room and the sender (the room's picture with the sender as a small round badge, or the sender alone in a direct chat) and a 👍 Like button. See [docs/push.md](docs/push.md).

## Not yet

Group calls (Element Call / MatrixRTC), GIF search and custom emoji packs (both need a third-party service or an unstable spec), several accounts at once, search inside encrypted rooms beyond what the device has loaded, and a true timeline virtualiser.

Known gaps in what has been verified: voice recording was tested with Chrome's fake microphone, not a real one, and the nginx changes for the microphone and audio playback (`security-headers.conf`) were not tested with a Docker build; single sign-on was only exercised against a stand-in identity provider, not a real one; QR scanning was tested with a screenshot of the code between two sessions, not a live camera; desktop notification pop-ups were not exercised (the unread count was); and accessibility has been checked with automated tools only (see below).

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
