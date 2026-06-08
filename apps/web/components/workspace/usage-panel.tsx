'use client';

import { useEffect, useState } from 'react';

// Cumulative usage for the project (STORY-22): total input/output tokens, an
// estimated cost, and the turn count, read from /api/projects/[id]/usage. The
// cost is an estimate — the agent's model isn't exposed, so a documented rate is
// applied at record time.

interface Usage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  turns: number;
}

const nf = new Intl.NumberFormat();
const usd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function UsagePanel({ projectId }: { projectId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetch(`/api/projects/${projectId}/usage`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Usage) => {
        if (cancelled) return;
        setUsage(data);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (state === 'loading') {
    return <div className="p-6 text-sm text-muted-foreground">Loading usage…</div>;
  }
  if (state === 'error' || !usage) {
    return <div className="p-6 text-sm text-destructive">Couldn’t load usage.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        Cumulative agent usage for this project across {nf.format(usage.turns)}{' '}
        {usage.turns === 1 ? 'turn' : 'turns'}.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Input tokens" value={nf.format(usage.inputTokens)} />
        <Stat label="Output tokens" value={nf.format(usage.outputTokens)} />
        <Stat
          label="Estimated cost"
          value={usd.format(usage.estimatedCostUsd)}
          hint="estimate — model not exposed by the agent"
        />
        <Stat label="Turns" value={nf.format(usage.turns)} />
      </div>
    </div>
  );
}
