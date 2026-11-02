# Installation

Tessera is a static web app: the browser talks to your homeserver directly and the host holds no secrets or state. The homeserver must allow the origin where Tessera is hosted (Synapse does by default).

## Docker (recommended)

Unprivileged nginx serving the static build with a strict Content Security Policy and security headers:

```sh
docker build -t tessera .
docker run -p 8080:8080 tessera
```

## Static build

Each release attaches `tessera-X.Y.tar.gz` and its `.sha256`: the same files the Docker image and GitHub Pages serve. Unpack it behind any web server that sends the headers in [`security-headers.conf`](https://github.com/hbenali/tessera/blob/HEAD/security-headers.conf).

## GitHub Pages

`.github/workflows/pages.yml` builds and deploys on every push to `main`. Pages cannot send response headers, so that build embeds the Content-Security-Policy as a `<meta>` tag; `frame-ancestors` cannot be set that way, so a Pages deployment can be framed by other sites. Prefer Docker if that matters to you.

## From source

```sh
cd app
npm install
npm run dev      # http://localhost:5173
```

## Optional: `config.json`

Background notifications are configured in a `config.json` next to `index.html`. See [Push notifications](Push-notifications).
