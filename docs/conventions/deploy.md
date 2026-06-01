# Conventions — deploy

How services land on the Praxis VPS. Cookbook split out of `AGENTS.md`
tier-3 once these patterns earned their weight across STORY-02 (web),
STORY-03 (postgres), STORY-04 (auth), and STORY-05 (orchestrator).

The runbooks at `docs/runbooks/deploy-*.md` describe daily ops per
service. This file is the **cross-cutting rules** every new service
should follow so we don't drift.

## VPS shape

- **Single VPS, multi-tenant** (see ADR-0001, ADR-0004). Caddy at
  `:80` + `:443` terminates TLS and routes by hostname. The VPS also
  hosts unrelated apps from other tenants — see
  `/etc/caddy/Caddyfile` for the composite.
- **Shared Docker bridge `praxis-net`.** All Praxis containers join
  this network so inter-service traffic uses container hostnames
  (e.g. `DATABASE_URL=postgres://…@praxis-db:5432/praxis`) rather
  than host loopback. Containers cannot reach `127.0.0.1:<host-port>`
  on the VPS — `127.0.0.1` inside a container is the container itself.
- **systemd owns the container lifecycle.** Each service is one unit
  (`praxis-<service>.service`) that runs `docker run --rm` in the
  foreground. systemd's `Restart=on-failure` handles crashes; the
  unit's `ExecStartPre` pulls `:latest` so `systemctl restart` after
  a deploy picks up the new image.

## Port allocation on this VPS

Other tenants own some low ports — pick from the free range when
adding a new service.

| Host port | Owner | Notes |
|---|---|---|
| 3000 | pre-existing tenant | not Praxis |
| 3001 | pre-existing tenant | not Praxis |
| **3002** | `praxis-web` | Next.js standalone |
| 4000 | pre-existing tenant | not Praxis |
| **4001** | `praxis-orchestrator` | Bun + Hono (HTTP + `/ws`) |
| 5432 | `praxis-db` | Postgres 16, bound `127.0.0.1` only |

All Praxis service ports bind to `127.0.0.1` on the host — only Caddy
talks to them. Don't expose `0.0.0.0:<port>` even in dev on this host.

## Caddyfile composite

- The **host file** at `/etc/caddy/Caddyfile` is a composite of blocks
  from this repo and from other tenants on the VPS. It is **edited
  by hand** when a new block is added — not symlinked.
- This repo's blocks live at `infrastructure/caddy/Caddyfile`. When
  you add or change a block here, paste it into the host file:
  ```bash
  sudo nano /etc/caddy/Caddyfile
  sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  sudo caddy fmt --overwrite /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  ```
- CI runs `caddy validate` + `caddy fmt --diff` against
  `infrastructure/caddy/Caddyfile` so syntax breaks fail before merge.
- WebSocket upgrades work transparently through `reverse_proxy` — no
  extra directives needed.
- TLS is via Caddy's built-in ACME (Let's Encrypt). Cert storage is in
  `/var/lib/caddy/.local/share/caddy/`.

## Env-file format — `/etc/praxis/praxis.env`

All services read the same file via `docker run --env-file`. Format
rules are stricter than `bash` because Docker's parser is unforgiving:

- **ASCII only.** A single em-dash or smart-quote silently truncates
  every variable from that line onward. Don't paste from notes apps.
- **No inline comments.** `KEY=value # comment` becomes
  `KEY=value # comment` — the parser doesn't strip the `#` tail.
  Comments must be their own line starting with `#`.
- **`KEY=value`**, one per line, no quoting unless the value contains
  whitespace. Don't use `export`.
- Values with spaces or special chars: wrap in double quotes — Docker
  passes the unquoted string to the container env.

The canonical file lives at `/etc/praxis/praxis.env`. Mode `0640`,
owned `root:deploy` so the `deploy` user can read it for `docker run`
but other users can't.

## systemd unit shape

Every Praxis service unit follows the same skeleton (see
`infrastructure/deploy/praxis-{web,orchestrator,postgres}.service` for
working examples):

```ini
[Unit]
Description=Praxis <service> container
After=docker.service network-online.target praxis-postgres.service
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

ExecStartPre=-/usr/bin/docker rm -f praxis-<service>
ExecStartPre=/usr/bin/docker pull ghcr.io/g-chappell/praxis-<service>:latest

ExecStart=/usr/bin/docker run --rm --name praxis-<service> \
  --network praxis-net \
  --env-file /etc/praxis/praxis.env \
  -p 127.0.0.1:<port>:<container-port> \
  ghcr.io/g-chappell/praxis-<service>:latest

ExecStop=/usr/bin/docker stop praxis-<service>

[Install]
WantedBy=multi-user.target
```

- `--rm` so stopped containers don't accumulate.
- `--network praxis-net` so other Praxis containers can DNS-resolve
  the service.
- `--env-file` not `-e KEY=val` lines — secrets stay out of `ps` and
  systemd journals.
- Port binding always `127.0.0.1:<host>:<container>` — Caddy is the
  only public surface.
- Health-checking lives in the **image** (or Caddy's `health_uri`),
  not in systemd. systemd cares about "is the container running",
  not "is the app healthy".

CI validates new units with `systemd-analyze verify
infrastructure/deploy/*.service`.

## Sudoers fragment

The `deploy` user can restart Praxis services and reload Caddy
without a password — needed for the SSH-action deploy step. Fragment
lives at `/etc/sudoers.d/praxis-deploy`:

```
deploy ALL=(root) NOPASSWD: \
  /bin/systemctl restart praxis-web.service, \
  /bin/systemctl restart praxis-orchestrator.service, \
  /bin/systemctl restart praxis-postgres.service, \
  /bin/systemctl reload caddy.service
```

Every new service appends one line. Validate with `visudo -c -f
/etc/sudoers.d/praxis-deploy` before saving — a syntax error here
locks deploys out.

## Docker image policy — GHCR

- **Registry:** `ghcr.io/g-chappell/praxis-<service>`.
- **Build context** is the **repo root** (not the service folder) so
  workspace packages (`packages/db`, `packages/shared`) are
  reachable. Each service's `Dockerfile` `COPY`s the workspaces it
  depends on explicitly — **manifest into the deps layer** (so
  `pnpm install` wires the symlink) **and source into the build layer**.
- **Tags pushed per build:** `:latest`, `:sha-<short>`, `:<branch>`
  (via `docker/metadata-action`). Rollback uses
  `docker tag <sha-tag> :latest && systemctl restart …`.
- **`GIT_SHA` build arg** — every Dockerfile takes
  `ARG GIT_SHA=dev`, the CI workflow passes the commit SHA, and the
  app reads it for `/health.gitSha`. Operators can confirm "what's
  actually running" without SSH.
- **First push to a new package**: GHCR returns **403** on the
  *second* push from CI if the package isn't linked to the repo. Two
  options:
  1. **Pre-push from the VPS** (no auth dance) so the package
     auto-creates linked to your user. Then CI can write.
  2. After the CI's first push (which usually succeeds anonymously),
     visit
     `https://github.com/users/<you>/packages/container/<name>/settings`
     and link the package to the repo + set visibility public.
- **Visibility:** make the production image public so the VPS pull
  doesn't need GHCR auth. Same package settings page.

## Deploy-readiness — failures CI can't see

CI builds in the full monorepo and runs in-process; several failure modes
only appear in the deployed container. `node scripts/deploy-readiness-check.mjs`
exists to catch them (scripted layer runs in CI; the full run adds an LLM
pass over the branch diff). The recurring ones, learned the hard way in
STORY-07:

- **Missing workspace COPY (happened twice).** A deployable gained a
  `@praxis/*` dependency but its `Dockerfile` didn't COPY the package, so the
  image built green in CI yet crash-looped at runtime
  (`ENOENT … node_modules/@praxis/sandbox`). **Fix:** COPY the package's
  `package.json` into the deps layer and its directory into the build layer —
  mirror how `packages/db` is handled. The scripted readiness check enforces
  this; it would have caught both incidents.
- **No-build services have no compile net.** The orchestrator runs Bun (TS
  natively; `build` is a no-op `echo`), so a missing dependency or bad import
  surfaces only when the container starts. Always **boot the image with
  prod-like env** (`--env-file`, `--network praxis-net`, the same mounts) and
  read the logs before calling an infra story done.
- **Host-resource access needs more than a mount.** Mounting
  `/var/run/docker.sock` is necessary but not sufficient: the container runs as
  non-root `bun` (gid 1000) and the socket is `root:docker` (mode `0660`), so
  dockerode failed with a vague "typo in the url or port?" until the unit added
  **`--group-add <docker-gid>`** (the host `docker` gid, `getent group docker` —
  988 on this VPS; host-specific). The same applies to published ports,
  volumes, and capabilities — verify access from *inside* the container.
- **Verify on a real cycle, not a smoke test.** Behaviour on a timer (e.g. the
  idle sweep first fires 60s after boot) is invisible to a 4-second check — that
  reads as a false "all clear". Boot the image and wait a full cycle, then
  assert the real signal (e.g. zero `sandbox.sweep_failed` after a sweep runs).
- **`.service` changes need a manual VPS re-apply.** The deploy workflow does
  `docker pull` + `systemctl restart`, but does **not** copy the unit file. Any
  change to mounts / `--group-add` / ports in `infrastructure/deploy/*.service`
  requires, on the VPS: `sudo cp … /etc/systemd/system/ && sudo systemctl
  daemon-reload && sudo systemctl restart <svc>`. List it under Operator
  follow-ups.

## CI deploy workflow shape

Every service has a `deploy-<service>.yml` mirroring this shape:

1. `on: push: branches: [main]` with `paths:` filters scoped to the
   service's workspace + its `infrastructure/deploy/<unit>.service`
   + the workflow file itself.
2. `concurrency: deploy-<service>` so two merges in quick succession
   queue rather than race.
3. Build with `docker/build-push-action@v6`, context `.`, passing
   `build-args: GIT_SHA=${{ github.sha }}`, with GHA cache.
4. SSH-action runs `sudo systemctl restart praxis-<service>.service`
   on the VPS.
5. **Smoke test** via `scripts/healthcheck.sh "<public-url>/health"
   60` so a failed deploy turns the build red.

The `paths:` filter is load-bearing — without it, every `docs/`
commit redeploys every service.

## What the operator does (every new service)

These steps can't be done from CI. List them in the PR's "operator
follow-ups" section so they aren't missed.

1. **DNS** — `A` record for `<sub>.<domain>` → VPS IP.
2. **GHCR package settings** — link to repo, flip to public (one-off
   per package).
3. **GH Actions variable** — any per-service `<SERVICE>_DOMAIN` var
   the workflow references.
4. **`/etc/praxis/praxis.env`** — add new env vars; reload affected
   services (`systemctl restart praxis-<service>`).
5. **Caddy block** — paste from `infrastructure/caddy/Caddyfile`,
   validate, reload.
6. **systemd unit** — `cp` from `infrastructure/deploy/`,
   `daemon-reload`, `enable --now`.
7. **Sudoers** — append the restart grant, `visudo -c`.

The runbook at `docs/runbooks/deploy-<service>.md` records these
**once they're done** as "Setup history (one-time)" so a future
VPS rebuild is reproducible.
