import { getActivePlatformKeyMeta } from '@praxis/keys';

import { ApiKeyForm } from '@/components/admin/api-key-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'API keys — Praxis Admin',
};

function formatWhen(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown';
}

export default async function AdminApiKeysPage() {
  // The admin layout already enforced access. Metadata only — never the raw key.
  const meta = await getActivePlatformKeyMeta();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform API key</h1>
        <p className="text-sm text-muted-foreground">
          The Anthropic API key that powers all agent sessions (ADR-0009). Stored encrypted; shown
          masked.
        </p>
      </div>

      {meta ? (
        <div className="space-y-1 rounded-lg border p-4">
          <p className="font-mono text-sm">{meta.maskedKey}</p>
          <p className="text-xs text-muted-foreground">Last set {formatWhen(meta.lastRotatedAt)}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-medium">No active key</p>
          <p className="text-sm text-muted-foreground">
            Agent sessions cannot run until a platform key is set.
          </p>
        </div>
      )}

      <ApiKeyForm hasKey={meta !== null} />
    </div>
  );
}
