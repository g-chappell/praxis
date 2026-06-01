# Runbook: sandbox base image

`praxis-sandbox-base` is the Docker image every project sandbox is created from
(see `infrastructure/docker/sandbox-base/Dockerfile`, ADR-0007). `DockerSandbox`
(`packages/sandbox`) does `createContainer({ Image: 'praxis-sandbox-base:latest', … })`,
so the image **must exist on whatever host runs the sandboxes** (the VPS).

Contents: `node:20-bookworm` + git, build-essential, python3, inotify-tools
(powers `watchFiles`), and the Claude Code CLI (`@anthropic-ai/claude-code`).

## Build / refresh

```bash
docker build -t praxis-sandbox-base:latest infrastructure/docker/sandbox-base
```

Rebuild when the Dockerfile changes or to pick up a newer Claude Code CLI.
There is no app state in the image — project files live in per-project Docker
volumes (`praxis-project-<id>`), not the image.

## Resource limits (per project_plan.md §6)

Applied by `DockerSandbox` via `HostConfig`, not the image:

- **Memory:** 2 GB (`Memory`) — enforced.
- **CPU:** 1 core (`NanoCpus`) — enforced.
- **Disk:** 5 GB (`StorageOpt.size`) — **only enforced on storage drivers that
  support it (xfs + pquota).** The current VPS uses overlayfs, where StorageOpt
  is silently ignored, so the disk cap is best-effort. `DockerSandbox` leaves it
  off by default (`diskLimit` config opt-in) to avoid failing container creates.
  Revisit if/when the host moves to an xfs-backed Docker root.

## Snapshot persistence (MinIO)

Idle sandboxes are stopped and removed after 30 min (the orchestrator's idle
sweep). Before removal, `DockerSandbox` tars `/workspace` and PUTs it to an
`ObjectStore` (ADR-0008); on the next `start()` with a fresh volume it restores
from there. The backend is MinIO, configured from env (read by
`MinioObjectStore.fromEnv()`):

| Env var | Notes |
| --- | --- |
| `MINIO_ENDPOINT` | host (no scheme), e.g. `minio` on `praxis-net` |
| `MINIO_PORT` / `MINIO_USE_SSL` | optional |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | credentials |
| `MINIO_BUCKET` | default `praxis-sandboxes` (one bucket, key per project) |

With these unset the orchestrator logs `persistence: none` and falls back to
local-volume persistence only (state survives restart on the same host, but not
a volume prune / host rebuild).

## Operator follow-ups (per host)

- [ ] Build the image on the VPS (command above) before the orchestrator starts
      creating sandboxes. CI builds it for the integration tests but does not
      push it; for prod, either build on the VPS or add a GHCR push + pull step
      when the orchestrator's sandbox path lands.
- [ ] **Provision MinIO** (container + bucket) and add `MINIO_*` to
      `/etc/praxis/praxis.env` to enable durable snapshots. Until then,
      persistence is volume-only.
- [ ] (Later) Network egress allowlist — deferred to STORY-19 / TASK-053, not
      yet applied to sandbox containers.

## Setup history

- **STORY-07 / TASK-022:** image introduced; `DockerSandbox` implements the §6
  `Sandbox` interface against it. Integration tests (`RUN_DOCKER_TESTS=1`) run in
  CI's `integration` job, which builds this image on the runner.
