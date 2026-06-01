# Praxis sandbox base image — the per-project execution environment.
#
# One image shared by all projects at POC (per-template images land in
# STORY-14). Built and tagged as `praxis-sandbox-base:latest`; DockerSandbox
# (packages/sandbox) creates containers from it. The container stays alive on
# `sleep infinity` so the orchestrator can exec/spawn into it on demand.
#
# Build:  docker build -t praxis-sandbox-base:latest infrastructure/docker/sandbox-base

FROM node:20-bookworm

# Tooling per project_plan.md §6: git, common build tools, Python, and
# inotify-tools (powers Sandbox.watchFiles via inotifywait).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    curl \
    inotify-tools \
  && rm -rf /var/lib/apt/lists/*

# The agent stack inside the sandbox (ADR-0009):
#  - @anthropic-ai/claude-code: the Claude Code CLI / Agent SDK runtime.
#  - @agentclientprotocol/claude-agent-acp: the ACP adapter the AcpHost
#    (packages/acp-host) speaks to over stdio. It authenticates with the
#    platform ANTHROPIC_API_KEY injected at spawn time — never a subscription
#    OAuth token. Pinned so the protocol surface can't drift under us.
RUN npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp@0.39.0

# Project files live here, mounted from a per-project Docker volume.
WORKDIR /workspace

# Idle foreground process: keeps the container running with no app of its own
# so DockerSandbox can exec into it. The 30-min idle sweep (TASK-023) stops it.
CMD ["sleep", "infinity"]
