# Conventions — orchestrator & sandbox runtime

Read this before touching `services/orchestrator` or the container-I/O
paths in `packages/sandbox`. These rules are tech-coupled to one fact:
**the orchestrator runs on Bun, not Node**, and Bun's HTTP client does not
behave like Node's under `dockerode`.

## The Bun ↔ dockerode rule (the one that keeps biting)

`dockerode` speaks to the Docker daemon over HTTP. Its **simple unary
calls** work fine under Bun — `inspect`, `create`, `start`, `stop`, `rm`,
`listContainers`, `exposePort`-style port lookups. Its **streaming /
hijacked-stream operations do not**: Bun rejects the chunked
request/response hijack with `501 Unsupported transfer encoding`.

Two confirmed failures this cost us real debugging time on:

| dockerode op | Symptom under Bun | Use instead | ADR |
|---|---|---|---|
| hijacked `exec` (attach stdin/stdout stream) | `501 Unsupported transfer encoding` | `docker exec [-i]` via the CLI | ADR-0010 |
| `putArchive` (tar upload — `writeFile`, template seed) | `501 Unsupported transfer encoding` | `writeFile` → `docker exec -i … tee`; seeding → `docker cp` | ADR-0014 |

**Rule:** for any sandbox **stream I/O** under Bun — writing files,
reading large output, seeding, anything that hijacks the connection —
**shell out to the `docker` CLI** (it's in the orchestrator image). Reserve
`dockerode` for the unary lifecycle calls. Do **not** reintroduce
`putArchive` or hijacked `exec`; they pass unit tests that mock the daemon
and only fail against a real daemon under Bun, i.e. at runtime in prod.

When adding a new sandbox capability, prove it against a **real daemon
under Bun** (boot the prod image, `RUN_DOCKER_TESTS=1`), not just Node
locally — Node won't reproduce the 501.

## Docker socket permissions

The orchestrator container runs as the non-root `bun` user (gid 1000); the
mounted socket is `root:docker` mode `0660`. Without the docker gid the
daemon calls fail with a misleading `"typo in the url or port?"`. The unit
grants access via `--group-add <docker-gid>` — see `deploy.md` and the
orchestrator `.service`. A socket-perms change needs a real container cycle
to verify (it only fails at runtime).

## Sandbox networking

Sandboxes must join `PRAXIS_NETWORK=praxis-net` or the preview proxy can't
reach `sandbox:<port>` and every preview 502s. Required in the env-file on
the VPS — see `deploy.md`. ⚠ Security: this currently puts untrusted sandbox
code on the same bridge as `praxis-db`; harden via STORY-19 (egress
allowlist / dedicated sandbox network).

## Preview routing

The orchestrator **is** the preview router (ADR-0015): one static Caddy
wildcard (`*.preview.<domain>`) reverse-proxies to `:4001`, and the
orchestrator maps `<slug>.preview.<domain>` → the sandbox container IP via
an in-memory registry, gated by on-demand-TLS `/caddy/ask`. We do **not**
mutate the shared multi-tenant Caddy dynamically. Known follow-up: the
preview serves over plain HTTP, so Vite's **HMR WebSocket is not proxied** —
the preview renders and updates on a manual refresh, but does not live-reload.
