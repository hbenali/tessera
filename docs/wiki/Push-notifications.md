# Push notifications

Without this, Tessera notifies you only while a tab is open. With it, your browser is woken by a push message even when Tessera is closed.

```
homeserver --(event id)--> push gateway --(Web Push, VAPID)--> browser push service --> Tessera's service worker
```

The service worker then asks your homeserver for the event itself, so the gateway and the browser vendor's push service see only an event id, never the message text. Encrypted rooms show "Encrypted message" because a worker cannot decrypt.

You need a push gateway that speaks Web Push; [Sygnal](https://github.com/element-hq/sygnal) does (the old `matrix-org/sygnal` is archived; use `element-hq/sygnal`). The full setup (VAPID key, `sygnal.yaml`, `config.json`, turning it on) is in [`docs/push.md`](https://github.com/hbenali/tessera/blob/HEAD/docs/push.md).

## Firebase

On Chrome and Edge the browser push service is Google's FCM (`fcm.googleapis.com`), and Tessera already uses it through standard Web Push. You do **not** need a Firebase project or SDK: list `fcm.googleapis.com` in Sygnal's `allowed_endpoints`.

## What has been verified

A real Sygnal 0.17 with desktop Chrome on Linux: the pusher registered with a real FCM endpoint, Sygnal pushed through FCM and it was accepted, and a notification appeared with the app closed. Not verified: the readable text through real FCM after the flat-payload fix, Firefox, Safari and Edge, and action buttons on specific operating systems.
