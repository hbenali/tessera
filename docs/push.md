# Background notifications (web push)

Without this, Tessera notifies you only while a tab is open. With it, your browser is woken by a push message even when Tessera is closed.

Matrix does not talk to browsers directly. The chain is:

```
homeserver --(event id)--> push gateway --(Web Push, VAPID)--> browser push service --> Tessera's service worker
```

The service worker then asks your homeserver for the event itself, so the gateway and the browser vendor's push service see only an event id, never the message text. Encrypted rooms show "Encrypted message" because a worker cannot decrypt.

You need to run (or use) a push gateway that speaks Web Push. [Sygnal](https://github.com/matrix-org/sygnal) does. Tessera cannot work without one, so this is off, and Settings says so, until you configure it.

## 1. Run Sygnal

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

## Quick actions

Notifications for readable messages carry a **👍 Like** button, which sends a reaction from the worker without opening the app. It is not offered for encrypted rooms. Support varies by browser and platform: Chromium-based browsers show action buttons; others may ignore them and just open the app.

## What has and has not been verified

Verified in automated browser tests: pusher registration and removal on a real Synapse; Synapse calling a stand-in gateway with an event-id-only payload; the service worker turning a delivered push into a notification with the sender's name, room name, text and avatar; the Like action sending a reaction; no Like for encrypted events; the session being stored and removed.

Not verified: delivery through a real browser push service and a real Sygnal (the tests stand in for the browser's push subscription); tapping a notification (the worker opens or focuses the window, tested only for the message it posts to the page); action buttons on specific operating systems.
