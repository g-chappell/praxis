# Deploy: `apps/web` to the Praxis VPS

How `apps/web` runs in production: a Docker container managed by systemd,
fronted by Caddy at `praxis.blacksail.dev`. Continuous-deploy is wired
via `.github/workflows/deploy-web.yml` (TASK-008); this runbook covers
**one-time VPS setup** and **manual operations**.

## Topology

```
                    https://praxis.blacksail.dev
                              │
                              ▼
                  ┌──────────────────────┐
                  │  Caddy (host :443)   │
                  │  TLS terminator      │
                  └──────────┬───────────┘
                             │ HTTP, 127.0.0.1:3000
                             ▼
                  ┌──────────────────────┐
                  │  praxis-web.service  │
                  │  (systemd, Type=simple)│
                  └──────────┬───────────┘
                             │ docker run --rm
                             ▼
                  ┌──────────────────────┐
                  │  ghcr.io/g-chappell/ │
                  │  praxis-web:latest   │
                  │  Next.js standalone  │
                  │  on :3000 in container│
                  └──────────────────────┘
```

Health endpoint exposed by the container:
`http://127.0.0.1:3000/api/health` → `{"ok":true}`. Caddy probes every
30s and parks an unhealthy upstream.

## One-time VPS setup (operator)

Done once, before the `deploy-web.yml` workflow can land a green deploy.

### 1. Install Caddy

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 2. Drop the Caddyfile and set the domain

```bash
sudo cp /opt/praxis/infrastructure/caddy/Caddyfile /etc/caddy/Caddyfile
```

Configure the domain. Two equivalent options — pick one:

**Option A (recommended):** systemd override.

```bash
sudo systemctl edit caddy.service
```

Add:

```
[Service]
Environment="PRAXIS_DOMAIN=praxis.blacksail.dev"
```

**Option B:** `/etc/default/caddy`.

```bash
echo 'PRAXIS_DOMAIN=praxis.blacksail.dev' | sudo tee -a /etc/default/caddy
```

Then validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

### 3. DNS

Add an A (or AAAA) record at the DNS provider for `blacksail.dev`:

| Type | Name | Value |
|---|---|---|
| A | `praxis` | `<vps-public-ipv4>` |

Verify with `dig +short praxis.blacksail.dev` from anywhere; should
return the VPS IP. Caddy's on-demand TLS will request a Let's Encrypt
certificate on the first request to the hostname.

### 4. Install the systemd unit

```bash
sudo cp /opt/praxis/infrastructure/deploy/praxis-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now praxis-web.service
```

The unit pulls `ghcr.io/g-chappell/praxis-web:latest` before each start,
so the **first start requires the image to exist on GHCR**. If TASK-008
hasn't run yet, push manually once:

```bash
# From a workstation with docker + gh auth:
cd /path/to/praxis
docker build -t ghcr.io/g-chappell/praxis-web:latest -f apps/web/Dockerfile .
echo "$GHCR_PAT" | docker login ghcr.io -u g-chappell --password-stdin
docker push ghcr.io/g-chappell/praxis-web:latest
```

Then on the VPS:

```bash
sudo systemctl start praxis-web.service
sudo systemctl status praxis-web.service
journalctl -u praxis-web.service -f
```

Smoke-test from the VPS:

```bash
curl -fsS http://127.0.0.1:3000/api/health
# {"ok":true}
```

### 5. Create the deploy user and SSH key

The deploy workflow SSHes in as a dedicated user with narrow sudo
privileges.

```bash
sudo useradd --create-home --shell /bin/bash deploy
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chown -R deploy:deploy /home/deploy/.ssh
```

**On a workstation**, generate the deploy keypair (do NOT generate it
on the VPS — the private key must never touch the production host):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/praxis-deploy -C "praxis-deploy"
```

Copy `~/.ssh/praxis-deploy.pub` to the VPS as the `deploy` user's
authorized key:

```bash
sudo tee -a /home/deploy/.ssh/authorized_keys < ~/.ssh/praxis-deploy.pub
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

### 6. Narrow sudo for the deploy user

Allow `deploy` to restart `praxis-web` (and reload Caddy for future
config bumps) without a password — and nothing else.

```bash
sudo visudo -f /etc/sudoers.d/praxis-deploy
```

Add exactly:

```
deploy ALL=(root) NOPASSWD: /bin/systemctl restart praxis-web.service, /bin/systemctl reload caddy.service
Defaults!/bin/systemctl env_keep += "DOCKER_HOST"
```

Also add `deploy` to the `docker` group so it can `docker pull` without
sudo:

```bash
sudo usermod -aG docker deploy
```

### 7. GitHub Actions secrets and variables

In the repo settings → Secrets and variables → Actions:

**Repository secrets:**

| Name | Value |
|---|---|
| `VPS_HOST` | VPS public hostname or IP (e.g. `praxis.blacksail.dev` once DNS is up, or the raw IP) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Contents of `~/.ssh/praxis-deploy` (the **private** key generated in step 5) |

**Repository variables** (not secret):

| Name | Value |
|---|---|
| `WEB_DOMAIN` | `praxis.blacksail.dev` |

Verify with `gh secret list` and `gh variable list` (requires `repo`
scope).

### 8. Make the GHCR package public

After the first image push, the package
`ghcr.io/g-chappell/praxis-web` defaults to private. The VPS pulls
without auth, so make it public:

GitHub → your profile → Packages → `praxis-web` → Package settings →
Change package visibility → Public.

Or via API:

```bash
gh api -X PATCH /user/packages/container/praxis-web/visibility \
  -f visibility=public
```

## Daily operations

### Tail the web container's logs

```bash
journalctl -u praxis-web.service -f
```

### Force a redeploy without a new commit

```bash
sudo systemctl restart praxis-web.service
# (the ExecStartPre pulls :latest first)
```

### Roll back to a previous image

Each successful deploy tags the image with both `:latest` and
`:sha-<short>`. To roll back:

```bash
# On the VPS:
docker tag ghcr.io/g-chappell/praxis-web:sha-abc1234 ghcr.io/g-chappell/praxis-web:latest
sudo systemctl restart praxis-web.service
```

Or temporarily run the older tag:

```bash
sudo systemctl stop praxis-web.service
docker run --rm -d --name praxis-web -p 127.0.0.1:3000:3000 \
  ghcr.io/g-chappell/praxis-web:sha-abc1234
# When recovered, re-tag :latest and `systemctl start` the unit.
```

### Caddy didn't get a Let's Encrypt cert

Check Caddy logs:

```bash
journalctl -u caddy.service --since "10 minutes ago"
```

Common causes: DNS A record doesn't point at the VPS yet, port 80 is
blocked (Let's Encrypt's HTTP-01 challenge needs it open), or
`PRAXIS_DOMAIN` is unset.

## Restart vs reload — note on STORY-02 AC #2

STORY-02 AC #2 reads:

> Merge to main triggers a deploy job that rebuilds the image and
> `systemctl reload` runs without dropping connections.

In practice the deploy workflow runs **`sudo systemctl restart
praxis-web.service`**, not `reload`. The `Type=simple` unit running
`docker run --rm` doesn't graceful-reload on SIGHUP; restart is the
clean option. Caddy's `reverse_proxy` buffers the brief gap (hundreds
of ms) so users see continuity rather than a 502.

The literal "no dropped connections" outcome is satisfied via Caddy's
upstream retry, not via a literal `systemctl reload`. ADR-0001 records
the deploy-topology choice; if true zero-downtime (blue/green on two
ports with a Caddy upstream swap) is needed later, it's a discrete
post-POC follow-up.
