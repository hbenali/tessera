# Security

- Report vulnerabilities privately: see [`SECURITY.md`](https://github.com/hbenali/tessera/blob/HEAD/SECURITY.md). Don't open a public issue.
- Messages are rendered with an escaping Markdown renderer covered by XSS regression tests.
- The session, including the access token (and those of any other saved account), is kept in the browser's `localStorage` and is only sent to your homeserver. An XSS bug would therefore be serious, which is why the Content-Security-Policy is strict. Keep the headers in `security-headers.conf` when you host it.
- With background notifications on, the service worker also holds your access token in IndexedDB until you turn the feature off or sign out.
- The gateway and the browser vendor's push service see only an event id, never message text.
- Tessera is early and not audited. Don't rely on it as your only client for anything critical.
