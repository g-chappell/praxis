'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

// Cumulative usage + budget for the project (STORY-22/23): total input/output
// tokens, an estimated cost against the budget cap, the turn count, and a control
// to raise the budget (which resumes prompting when over). The cost is an
// estimate — the agent's model isn't exposed, so a documented rate is applied.

interface Usage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  turns: number;
  budgetUsd: number;
  overBudget: boolean;
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
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setState('loading');
    try {
      const res = await fetch(`/api/projects/${projectId}/usage`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Usage;
      setUsage(data);
      setBudgetInput(data.budgetUsd.toFixed(2));
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]);

  async function saveBudget() {
    const value = Number(budgetInput);
    if (!Number.isFinite(value) || value < 0) {
      setSaveError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ budgetUsd: value }),
      });
      if (!res.ok) {
        setSaveError('Couldn’t update the budget. Try again.');
        setSaving(false);
        return;
      }
      await load();
    } catch {
      setSaveError('Couldn’t update the budget. Try again.');
    } finally {
      setSaving(false);
    }
  }

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

      {usage.overBudget && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This project is over budget — prompting is paused. Raise the budget below to resume.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Input tokens" value={nf.format(usage.inputTokens)} />
        <Stat label="Output tokens" value={nf.format(usage.outputTokens)} />
        <Stat
          label="Estimated cost"
          value={usd.format(usage.estimatedCostUsd)}
          hint={`of ${usd.format(usage.budgetUsd)} budget — estimate, model not exposed`}
        />
        <Stat label="Turns" value={nf.format(usage.turns)} />
      </div>

      <div className="space-y-2 rounded-md border p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Budget (USD)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            aria-label="Budget in USD"
            className="w-40 rounded-md border px-3 py-1.5 text-sm"
          />
        </label>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <Button onClick={saveBudget} disabled={saving}>
          {saving ? 'Saving…' : 'Save budget'}
        </Button>
      </div>
    </div>
  );
}
