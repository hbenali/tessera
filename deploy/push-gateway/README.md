# Push gateway for Tessera (Sygnal + Caddy)

A small, hardened setup for [background notifications](../../docs/push.md): [Sygnal](https://github.com/element-hq/sygnal) (the Matrix push gateway) behind [Caddy](https://caddyserver.com), which gets and renews the HTTPS certificate by itself. It runs on a cheap VPS.

Measured on a 1 vCPU / 2 GB Ubuntu 26.04 server: Sygnal about 56 MiB of RAM, Caddy about 14 MiB, 3 GB of the 19 GB disk used by the system and both images.

What it exposes to the internet: only `POST /_matrix/push/v1/notify` (passed on to Sygnal) and `/health`. Everything else is a 404 from Caddy, and request bodies over 64 KB are refused. Sygnal itself listens on localhost only, runs as a non-root user with a read-only filesystem and no capabilities, and both images are pinned by digest.

## What you need

- A server with Docker, ports 80 and 443 reachable from the internet, and about 1 GB of free RAM. Ubuntu 24.04 or newer, or Debian 12 or newer, work.
- A hostname for the gateway, for example `push.example.org`, with a DNS **A** record pointing at the server's IP address.
- Your homeserver must be able to reach that hostname over HTTPS.

## 1. Open the ports (two firewalls)

Many providers put their own firewall in front of the server (a "security group"), **separate from the firewall on the machine**. Allow inbound **TCP 80**, **TCP 443** and, optionally, **UDP 443** (HTTP/3) there. Port 80 is used for the certificate and the redirect to HTTPS. If a port times out from outside while nothing blocks it on the server, this is the cause.

On the server (allow SSH first, so you cannot lock yourself out):

```sh
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw default deny incoming && sudo ufw --force enable
```

## 2. Install Docker

Use Docker's own repository: <https://docs.docker.com/engine/install/ubuntu/> (or `/debian/`). Check the key fingerprint it asks you to verify. You need `docker-ce` and `docker-compose-plugin`.

## 3. Put the files on the server

```sh
sudo install -d -m 0755 /opt/sygnal /opt/sygnal/sygnal
# from this folder: docker-compose.yml and Caddyfile to /opt/sygnal, sygnal/sygnal.yaml to /opt/sygnal/sygnal
```

Edit two things:

- `Caddyfile`: replace `push.hbenali.ovh` with your hostname.
- `sygnal/sygnal.yaml`: set `vapid_contact_email` to your own address. Browser push services see it with each push.

## 4. Make the VAPID key (on the server, and only there)

```sh
cd /opt/sygnal/sygnal
sudo openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out private_key.pem
sudo chown 10001:10001 private_key.pem && sudo chmod 0400 private_key.pem      # 10001 is the user the container runs as

# The public half, which goes into Tessera's config.json (87 characters):
sudo openssl pkey -in private_key.pem -pubout -outform DER | tail -c 65 | base64 -w0 | tr '+/' '-_' | tr -d '='; echo
```

**Back the private key up somewhere safe and offline.** If it is lost, every browser's subscription stops working and everyone has to turn notifications on again. Do not commit it.

## 5. Start it

```sh
cd /opt/sygnal
sudo docker compose up -d sygnal          # check it first, on its own
sudo docker compose logs sygnal           # expect: "Configured with app IDs: dict_keys(['ovh.hbenali.tessera.web'])"
curl -s http://127.0.0.1:5000/health      # HTTP 200
sudo docker compose up -d caddy           # only when the DNS record and the ports from step 1 are in place
```

Caddy gets the certificate on its first start. Watch `sudo docker compose logs caddy` for `certificate obtained successfully`. It renews on its own.

## 6. Check it from outside

```sh
curl -sI https://push.example.org/health                      # 200, with a Strict-Transport-Security header
curl -s -o /dev/null -w '%{http_code}\n' https://push.example.org/              # 404
# A notification to an address that is not allowed must be refused, without contacting anyone:
curl -s -X POST https://push.example.org/_matrix/push/v1/notify -H 'Content-Type: application/json' \
  -d '{"notification":{"event_id":"$e","devices":[{"app_id":"ovh.hbenali.tessera.web","pushkey":"BDummy","pushkey_ts":1,"data":{"endpoint":"https://push.invalid/x","auth":"AAAAAAAAAAAAAAAAAAAAAA"}}]}}'
# -> {"rejected": []}, and Sygnal logs "push.invalid is not in allowed_endpoints, blocking request"
```

## 7. Tell Tessera

In `config.json` next to `index.html` (for GitHub Pages or a static host: `app/public/config.json` before building):

```json
{ "push": { "gateway": "https://push.example.org/_matrix/push/v1/notify", "vapidPublicKey": "<the 87 characters from step 4>" } }
```

Then, in Settings, Notifications, **When Tessera is closed**, Turn on. Watch `sudo docker compose logs -f sygnal` to see a push go through.

## Notes

- **Why the compose file has its own health check:** the Sygnal image ships a health check that runs `curl`, which is not in the image, so Docker would show the container as "unhealthy" forever. The file replaces it with one that uses Python.
- **Allowed browsers:** `allowed_endpoints` in `sygnal.yaml` lists the push services the gateway may call (Chrome and Edge use Google's, Firefox Mozilla's, Safari Apple's). A browser whose service is not listed is refused.
- **Updating:** read the release notes of [element-hq/sygnal](https://github.com/element-hq/sygnal/releases) and Caddy, change the pinned tag and digest in `docker-compose.yml`, then `sudo docker compose pull && sudo docker compose up -d`.
- **Logs** are capped at 3 files of 10 MB each per container, so they cannot fill the disk.
- **Resource use:** `sudo docker stats --no-stream`.
