# Troubleshooting

## Settings says background notifications are off, with no way to turn them on

The deployment has no push gateway configured. Add the `push` block to `config.json` (see [Push notifications](Push-notifications)). The gateway must be `https://`; plain `http://` is accepted only for localhost and private addresses.

## I turned push on but no notification appears

- **A Tessera window is open, visible and focused.** The worker deliberately shows nothing then, because that window already shows the message. Test with the app closed.
- **The notification says only "New message".** An older build read only a nested payload; Sygnal sends its fields flat. Update to a build that includes the `fix(push)` change.
- **Synapse never reaches the gateway.** If the gateway is on a private address, list its range in `ip_range_whitelist` in `homeserver.yaml`.
- **The gateway rejects the browser.** The push service's host must be in Sygnal's `allowed_endpoints` (for Chrome, `fcm.googleapis.com`).

## Encrypted rooms show "Encrypted message"

Expected: a background worker cannot decrypt. Reply and Like buttons are also not offered there.

## The app is a blank page offline

Fixed in recent builds, which show an offline bar and queue outgoing messages. Update the deployment and reload once online.

## Sign-in fails against my homeserver

Check that the homeserver allows the origin Tessera is served from (CORS) and that the URL in the Homeserver field is reachable from the browser.
