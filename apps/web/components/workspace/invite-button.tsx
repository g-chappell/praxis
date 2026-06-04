'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

// "Invite" control in the workspace header (STORY-31/TASK-082). Mints a
// single-use, 7-day invite link for this project's team and reveals it with a
// copy button. The owner shares the link out-of-band; opening it joins the team.
export function InviteButton({ projectId }: { projectId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createLink() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/invites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) {
        setError('Could not create an invite link.');
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      setLink(url ?? null);
    } catch {
      setError('Could not create an invite link.');
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Copy failed — select the link and copy manually.');
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="sm"
        variant="outline"
        data-testid="workspace-invite-button"
        disabled={pending}
        onClick={createLink}
      >
        {pending ? 'Creating…' : 'Invite'}
      </Button>

      {link && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <input
              data-testid="invite-link-input"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
            />
            <Button size="sm" variant="outline" data-testid="invite-copy-button" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Expires in 7 days · single use</p>
        </div>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
