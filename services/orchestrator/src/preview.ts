// Preview routing (STORY-13). Caddy can't be mutated dynamically (shared,
// multi-tenant host service), so a single static wildcard block
// `*.preview.<domain>` reverse-proxies ALL preview traffic to the orchestrator
// (:4001), and this module does the dynamic part:
//   - a slug→sandbox registry (slug = projectId),
//   - the Caddy on_demand_tls `ask` verdict (issue a cert only for live previews),
//   - an HTTP reverse proxy to the sandbox's dev server.
// See ADR-0015.

export interface PreviewTarget {
  /** Sandbox container IP on praxis-net (reachable from the orchestrator). */
  ip: string;
  port: number;
}

const registry = new Map<string, PreviewTarget>();

export function registerPreview(slug: string, target: PreviewTarget): void {
  registry.set(slug, target);
}

export function removePreview(slug: string): void {
  registry.delete(slug);
}

export function getPreview(slug: string): PreviewTarget | undefined {
  return registry.get(slug);
}

/** The preview zone. Defaults to the prod domain so previews work without extra
 *  env plumbing on the VPS; dev/tests override via PREVIEW_DOMAIN. Must match the
 *  Caddy `*.preview.<domain>` block + the wildcard DNS record. */
export function previewDomain(): string {
  return process.env.PREVIEW_DOMAIN ?? 'preview.praxis.blacksail.dev';
}

/** Public preview URL for a slug. */
export function previewUrlFor(slug: string): string {
  return `https://${slug}.${previewDomain()}`;
}

/** Extract the slug (single subdomain label) from a `<slug>.preview.<domain>`
 *  Host, or null when the host isn't a preview host. Strips any `:port`. */
export function slugForHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.split(':', 1)[0]!.toLowerCase();
  const suffix = `.${previewDomain().toLowerCase()}`;
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  if (!slug || slug.includes('.')) return null; // exactly one label
  return slug;
}

/** Caddy on_demand_tls ask verdict: true iff `domain` maps to a live preview. */
export function caddyAsk(domain: string | null | undefined): boolean {
  const slug = slugForHost(domain);
  return slug !== null && registry.has(slug);
}

/** If this is a preview-host WebSocket upgrade, return the slug; else null
 *  (STORY-30). Vite's HMR client connects to `wss://<slug>.preview.<domain>` — we
 *  tunnel that upgrade to the sandbox dev server; plain HTTP previews still go
 *  through proxyToSandbox. Node-safe (no Bun) so it stays unit-testable. */
export function previewWsSlug(
  host: string | null | undefined,
  upgradeHeader: string | null | undefined,
): string | null {
  if ((upgradeHeader ?? '').toLowerCase() !== 'websocket') return null;
  return slugForHost(host);
}

/** The upstream `ws://` URL for a preview WS upgrade — the sandbox dev server,
 *  preserving the request path + query (Vite's HMR endpoint). */
export function upstreamWsUrl(target: PreviewTarget, req: Request): string {
  const url = new URL(req.url);
  return `ws://${target.ip}:${target.port}${url.pathname}${url.search}`;
}

const HOP_BY_HOP = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade'];

/** Reverse-proxy a preview HTTP request to the sandbox dev server. (Vite HMR's
 *  WebSocket isn't proxied here — the app renders over plain HTTP; HMR is a
 *  follow-up.) Returns 502 when the upstream isn't answering yet (dev server
 *  still starting). */
export async function proxyToSandbox(req: Request, target: PreviewTarget): Promise<Response> {
  const url = new URL(req.url);
  const upstream = `http://${target.ip}:${target.port}${url.pathname}${url.search}`;
  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  try {
    return await fetch(upstream, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
      // Bun/undici need this to stream a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    return new Response('preview starting…', {
      status: 502,
      headers: { 'content-type': 'text/plain', 'retry-after': '2' },
    });
  }
}
