'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';

// Set / rotate the platform API key. Posts to /api/admin/api-keys, which stores
// it encrypted and returns masked metadata only. On success we clear the field
// and refresh so the page re-reads the (masked) state.
export function ApiKeyForm({ hasKey }: { hasKey: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (
      hasKey &&
      !window.confirm(
        'Rotate the platform key? New agent sessions will use the new key immediately.',
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'request_failed');
        return;
      }
      setKey('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{hasKey ? 'Rotate key' : 'Set key'}</span>
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border px-3 py-2 font-mono text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">Could not save key: {error}</p>}
      <Button type="submit" disabled={pending || key.trim().length === 0}>
        {pending ? 'Saving…' : hasKey ? 'Rotate' : 'Save'}
      </Button>
    </form>
  );
}
