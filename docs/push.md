# Background notifications (web push)

Without this, Tessera notifies you only while a tab is open. With it, your browser is woken by a push message even when Tessera is closed.

Matrix does not talk to browsers directly. The chain is:

```
homeserver --(event id)--> push gateway --(Web Push, VAPID)--> browser push service --> Tessera's service worker
```

The service worker then asks your homeserver for the event itself, so the gateway and the browser vendor's push service see only an event id, never the message text. Encrypted rooms show "Encrypted message" because a worker cannot decrypt.

You need to run (or use) a push gateway that speaks Web Push. [Sygnal](https://github.com/element-hq/sygnal) does. (The original `matrix-org/sygnal` repository is archived; Element maintains it as `element-hq/sygnal`. This page was tested with Sygnal 0.17, which is also its latest release.) Tessera cannot work without one, so this is off, and Settings says so, until you configure it.

## 1. Run Sygnal

A ready-made, hardened setup (Sygnal behind Caddy with automatic HTTPS, for a small VPS) is in [`deploy/push-gateway/`](../deploy/push-gateway/README.md). It was measured at about 70 MB of RAM in total. The steps below explain what it does.

Generate a VAPID key pair in Sygnal's virtualenv:

```sh
vapid --gen --applicationServerKey
```

This writes `private_key.pem` and `public_key.pem` and prints the **Application Server Key**. Keep the private key on the gateway; the Application Server Key is public.

`sygnal.yaml`:

```yaml
apps:
  ovh.hbenali.tessera.web:        # Tessera's app id, fixed
    type: webpush
    vapid_private_key: /etc/sygnal/private_key.pem
    vapid_contact_email: you@example.org
    allowed_endpoints:            # which browser push services the gateway may call
      - "fcm.googleapis.com"
      - "updates.push.services.mozilla.com"
      - "*.notify.windows.com"
      - "*.push.apple.com"
```

Serve it over HTTPS at a URL your homeserver can reach, for example `https://push.example.org`. Its notify path is `/_matrix/push/v1/notify`.

If the gateway is on a private address, Synapse refuses to call it unless you list the range in `ip_range_whitelist` in `homeserver.yaml`.

## 2. Tell Tessera about it

Tessera reads `config.json` next to `index.html` when the page loads:

```json
{
  "push": {
    "gateway": "https://push.example.org/_matrix/push/v1/notify",
    "vapidPublicKey": "BNc...the Application Server Key..."
  }
}
```

- **Docker:** mount your file over the default one: `-v ./config.json:/usr/share/nginx/html/config.json:ro`
- **GitHub Pages / static hosting:** edit `app/public/config.json` before building.

The gateway must be `https://`; plain `http://` is accepted only for localhost and private addresses, for trying it out.

## 3. Turn it on

Settings, Notifications, **When Tessera is closed**, Turn on. The browser asks for permission. Tessera then:

1. subscribes the browser with the gateway's key,
2. registers a Matrix pusher (`app_id` `ovh.hbenali.tessera.web`, `format: event_id_only`, `events_only: true`) so the homeserver sends events to the gateway, following your push rules and per-room mute settings,
3. keeps your session in this browser's IndexedDB so the worker can read the event. **This is the cost:** the background worker holds your access token while the feature is on. It is removed when you turn it off or sign out.

## Which devices get notifications

Each browser or phone has its own registration (a Matrix pusher) on your account, so turning it on in one never turns it off in another. Settings, Notifications, **Devices with background notifications on** lists them: this browser first (tagged "This browser"), then the others with the push service each uses (Google, Mozilla, Apple or Microsoft; the private address is never shown). A device set up for a different gateway than this site's is flagged, because it will not receive from this one. You can remove another device from the list; it can turn the feature on again. Each browser names its own registration after itself (for example "Tessera (Chrome on Linux)") the next time it opens Settings.

## Quick actions

Notifications for readable messages carry buttons that act from the worker without opening the app: **Reply** (type an answer), **quick replies** (one tap sends a short text you chose, as a reply to the message), **Mark as read** (a private receipt) and **👍 Like**. They are not offered for encrypted rooms, where the worker cannot read or encrypt (an encrypted message can still be marked read).

A browser shows only as many buttons as it has room for, often two (Android and many desktops), so they are chosen in this order: Reply, your first quick reply, Mark as read, Like, then your other quick replies. On a phone that means Reply and the first quick reply. Support varies by browser and platform: Chromium-based browsers show action buttons; others may ignore them and just open the app.

**Quick replies** are set in Settings, Notifications, Quick reply buttons: up to three short texts (40 characters each), "OK", "Thanks" and "On my way" to start with. They are kept in your Matrix account data, so they follow you to your other devices, and an empty list turns them off.

**The small status-bar icon** on Android (the notification's `badge`) is a separate image, `badge-96.png`: Android uses only its transparency and paints it one colour, so it is the app's four tiles in white on a transparent background. Using the app icon there would show a plain square.

## What has and has not been verified

Verified in automated browser tests: pusher registration and removal on a real Synapse; Synapse calling a stand-in gateway with an event-id-only payload; the service worker turning a delivered push into a notification with the sender's name, room name, text and avatar; the Like action sending a reaction; no Like for encrypted events; the session being stored and removed.

Also verified by hand (2 Nov 2026), with a real Sygnal 0.17 and desktop Chrome on Linux: the pusher registered with a real `fcm.googleapis.com` endpoint; Synapse called Sygnal, which pushed through FCM and got it accepted (`{"rejected":[]}`); and a notification appeared with the app closed. That run found that Sygnal sends its fields flat (`event_id`, `room_id`, ...) rather than under a `notification` key; the worker now reads both, and a test covers the flat shape.

Also verified by hand (10 Nov 2026), end to end on the setup in [`deploy/push-gateway/`](../deploy/push-gateway/README.md): a Sygnal 0.17 gateway on a small VPS behind Caddy with a Let's Encrypt certificate, a real Synapse 1.144.0 homeserver, and Chrome on Fedora Linux. Synapse's calls to the gateway were all accepted (`{"rejected":[]}`), and the notifications that appeared with the app closed showed the message text and the avatar, so the readable text now works through real FCM after the flat-payload fix. The gateway used about 56 MiB of RAM and almost no CPU.

Not verified: the Reply and Like buttons on a notification that came through real FCM (they are tested with a stand-in push); other browsers and push services (Firefox, Safari, Edge); tapping a notification (the worker opens or focuses the window, tested only for the message it posts to the page); action buttons on specific operating systems.
