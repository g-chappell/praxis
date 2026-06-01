'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

const ERRORS: Record<string, string> = {
  connection_expired: 'This connection attempt expired. Start again.',
  missing_code: 'Paste the code Anthropic showed you.',
  state_mismatch: 'That code does not match this attempt. Start again.',
  exchange_failed: 'Anthropic rejected the code. Make sure you copied all of it, or start again.',
  unauthorized: 'Your session expired. Reload and sign in again.',
};

export function ConnectClaudeCode() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    setStarted(true);
    // New tab so this page (with the paste box) stays open. The route sets the
    // PKCE/state cookies, then redirects to Anthropic's consent screen.
    window.open('/api/oauth/anthropic/authorize', '_blank', 'noopener,noreferrer');
  }

  async function handleComplete() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/oauth/anthropic/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(ERRORS[data?.error ?? ''] ?? 'Something went wrong. Start again.');
    } finally {
      setPending(false);
    }
  }

  if (!started) {
    return <Button onClick={handleStart}>Connect to Claude Code</Button>;
  }

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Authorize Praxis in the tab that just opened.</li>
        <li>Copy the code Anthropic shows you.</li>
        <li>Paste it below and finish.</li>
      </ol>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste the code here"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button onClick={handleComplete} disabled={pending || code.trim().length === 0}>
          {pending ? 'Connecting…' : 'Finish connecting'}
        </Button>
        <button
          type="button"
          onClick={handleStart}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
