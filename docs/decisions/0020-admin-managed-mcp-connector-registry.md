# 0020 — Admin-managed MCP connector registry

**Date:** 2026-06-08
**Status:** **Proposed** — MCP is a load-bearing open standard (AGENTS.md), so
this change **requires both-contributor sign-off before any implementation
task (TASK-147 onward) starts.** TASK-146 (this ADR) is docs-only.

**Story:** STORY-50 (EPIC-09). Builds on ADR-0018 (image-gen MCP server + the
"Path A" sandbox MCP wiring) and the platform-key crypto posture (ADR-0009,
`packages/crypto`).

## Context

Today an MCP server reaches the sandbox agent through **static config**
(ADR-0018, "Path A"): a template declares servers in `template.json`
(`mcp_servers`), and at sandbox start `services/orchestrator/src/mcp-seed.ts`
writes the project's `/workspace/.mcp.json` (no secrets) plus a Claude
`settings.json` with `enableAllProjectMcpServers` (via `settingSources`), and
delivers the server's secret through an **ephemeral cred file at
`/run/praxis-mcp/config.json`** — absolute, outside `/workspace` so it never
hits git or MinIO. The server command (`praxis-mcp-image-gen`) resolves to a
**wrapper baked into the `praxis-sandbox-base` image** (an esbuild single-file
bundle on a fixed path). Crucially, **no change to `packages/acp-host`** (the
sacred ACP layer) is needed — that was the load-bearing finding of ADR-0018.

Limitations we want to remove without breaking any of the above:

- The only way to add/enable a connector is a code change (template edit + image
  rebuild). There is no admin surface to enable/disable a connector, set its
  credential, or cap its usage at runtime.
- Image-gen's enablement is implicitly tied to "an OpenAI key is configured" —
  there's no first-class, auditable connector record.

STORY-50 asks for an **admin-managed registry** of connectors (enable/disable,
encrypted credentials, usage caps) that the orchestrator renders into each new
sandbox — **without** changing the ACP host or the Path-A mechanism beyond what
this ADR approves.

The load-bearing risks: (1) MCP is an open standard we don't want to fork;
(2) a registry that let an admin specify an **arbitrary command string** would
be remote code execution into every sandbox via a DB row; (3) credentials must
keep the encrypted-at-rest + never-in-`/workspace` posture.

## Decision

1. **A `mcp_connectors` registry table** (admin-curated, platform-wide):
   `id`, `name` (unique, the `.mcp.json` server key), `command_ref` (text — see
   §2), `args` (jsonb, non-secret), `enabled` (boolean, default **false**),
   `credentials_encrypted` (text, nullable — ciphertext via `@praxis/crypto`),
   `usage_cap` (int, nullable — per-day cap), `created_by` (uuid), `created_at`.
   No per-user/per-project columns: connectors are **platform-wide**, applied to
   every new sandbox when `enabled`. (Template/project scoping is a later,
   additive concern, explicitly out of scope here.)

2. **`command_ref` is a key into a fixed allow-list of wrappers baked into
   `praxis-sandbox-base`, NOT a free-form shell command.** The orchestrator maps
   `command_ref` → a known baked path (e.g. `image-gen` →
   `praxis-mcp-image-gen`). An unknown `command_ref` renders nothing (clean
   degrade) and is rejected at the admin boundary. **This is the security
   linchpin:** adding a *new* connector type is a deliberate two-step — bake its
   wrapper into `sandbox-base` (a reviewed image change) **then** register a row
   referencing it — never an admin typing a command. This preserves
   "admin-curated only" (STORY-50 out-of-scope: no arbitrary user-supplied MCP
   servers) and keeps arbitrary code out of the sandbox.

3. **Credentials keep the ADR-0009 posture and the ADR-0018 delivery path.**
   `credentials_encrypted` is `@praxis/crypto` ciphertext (same as
   `platform_api_keys`/`oauth_tokens`), written once, **never returned
   plaintext** (admin surfaces show masked/"set" only), rotatable. At sandbox
   start the orchestrator decrypts the *enabled* connectors' creds and writes
   them to the **ephemeral `/run/praxis-mcp/…` file (outside `/workspace`)** —
   exactly the ADR-0018 pattern, generalized from one server to N. No secret
   ever enters `/workspace`, `.mcp.json`, MinIO, or the agent's env.

4. **Enable/disable gates rendering.** Only `enabled = true` connectors are
   rendered into a sandbox's `.mcp.json` + settings. Disabling a connector means
   new sandboxes don't get it (existing live sandboxes are unaffected until
   restart — acceptable; documented).

5. **Orchestrator rendering generalizes `mcp-seed.ts` (Path A preserved).** At
   sandbox start the orchestrator reads the enabled registry, renders the
   project `.mcp.json` (server key = `name`, `command` = the baked wrapper for
   `command_ref`, `args`, non-secret `env` pointing at the cred file) and the
   Claude `settings.json` (`enableAllProjectMcpServers` via `settingSources`).
   **No `packages/acp-host` change** — this is still Path A (ADR-0018). The
   existing image-gen path is refactored to read from the registry (image-gen
   becomes the first registry entry; the template's `mcp_servers` declaration
   and the OpenAI-key gate are reconciled with the registry, not duplicated).

6. **Usage caps reuse the `mcp_usage` mechanism (ADR-0018/STORY-15).** A
   connector's `usage_cap` is enforced via the existing per-project/per-tool/
   per-day `mcp_usage` counter + `checkAndIncrement`, keyed by the connector
   `name`. No new cap engine.

7. **Admin surface is role-gated + audit-logged.** CRUD lives behind
   `isUserAdmin` at `/admin/connectors`; every create/enable/disable/credential/
   cap change writes an `audit_log` row (new `connector.*` audit actions). Fits
   the EPIC-08 accountability model.

## Consequences

- **New:** `mcp_connectors` table (+ migration + codegen); `/admin/connectors`
  CRUD (lib + API + UI); orchestrator registry-driven rendering; `connector.*`
  audit actions; a Docker-gated integration test proving an enabled connector is
  reachable by the agent (`.mcp.json` present + server resolvable).
- **Security:** no arbitrary command execution (curated `command_ref` →
  allow-listed baked wrapper); credentials encrypted at rest, never returned
  plaintext, delivered only via the ephemeral file outside `/workspace`;
  admin-only; audited.
- **Bounded blast radius:** Path A and the ACP host are unchanged; the change is
  "where the connector list comes from" (registry vs static template), not "how
  MCP reaches the agent."
- **Onboarding a new connector** is a two-step reviewed process (bake wrapper →
  register), by design — not self-service. Acceptable for an admin-curated set.
- Image-gen is migrated onto the registry as the first entry; its template
  declaration + OpenAI-key gate are reconciled, not removed.

## Alternatives considered

- **Status quo (static template config).** Rejected: no runtime admin control of
  enable/disable, credentials, or caps — STORY-50's whole point.
- **Free-form admin-supplied command + args.** Rejected: RCE into every sandbox
  via a DB row. The curated `command_ref` allow-list (baked wrappers) gives the
  flexibility we need without that risk.
- **Per-project or per-user connectors.** Out of scope: admin-curated,
  platform-wide for now; project scoping can be added later additively.
- **Credentials in the agent env (`${VAR}` expansion).** Rejected (also rejected
  in ADR-0018): puts secrets in the agent's environment; the ephemeral cred file
  keeps them out of `/workspace` and the agent env.
- **Native-ACP `mcpServers` param (Path B).** Rejected: would change
  `packages/acp-host` (sacred) for no functional gain over Path A (ADR-0018).

## Sign-off required (both contributors) before implementation

Per AGENTS.md ("Anything ACP- or MCP-related changes only with an ADR and
confirmation from both contributors"), TASK-147–150 (table, orchestrator
rendering, admin CRUD, integration) **must not start** until both contributors
approve this ADR and it moves to **Accepted**. Open questions for sign-off:

- The `command_ref` allow-list + the "bake-then-register" onboarding flow — is
  this the right bound on "admin-curated"?
- Platform-wide application to all new sandboxes (vs template/project scoping) —
  acceptable for the POC?
- Reusing `mcp_usage` for per-connector daily caps (vs a dedicated cap field
  engine).
