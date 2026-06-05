'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';

// The live preview of the sandbox's dev server (STORY-13/14). The dev server is
// auto-started on session start; it can take a minute to come up, during which
// the iframe shows the orchestrator's "starting…" 502 — hit Refresh once it's up.
//
// Vite's own hot-reload is OFF in the sandbox (vite.config). Instead the preview
// updates are gated to agent-turn-completion: while the agent works the preview
// holds steady, then reloads ONCE when the turn finishes — but only if files
// actually changed during it (file_changed already excludes the agent's
// .praxis-agent store, STORY-36). No flashing on the agent's mid-turn churn.
export function PreviewPane() {
  const { previewUrl, status, subscribe } = useWorkspaceSocket();
  const [nonce, setNonce] = useState(0); // bump to reload the iframe
  const dirtyRef = useRef(false);

  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      if (frame.type === 'file_changed') {
        dirtyRef.current = true;
      } else if (frame.type === 'agent_event') {
        const event = frame.event as { type?: string } | undefined;
        if (event?.type === 'turn-complete' && dirtyRef.current) {
          dirtyRef.current = false;
          setNonce((n) => n + 1); // agent's done + files changed → reload once
        }
      }
    });
  }, [subscribe]);

  if (status !== 'connected' || !previewUrl) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {status === 'connected' ? 'No preview for this template.' : 'Connecting…'}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="truncate text-xs text-muted-foreground hover:underline"
        >
          {previewUrl}
        </a>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>
            Refresh
          </Button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            Open ↗
          </a>
        </div>
      </div>
      <iframe
        key={nonce}
        src={previewUrl}
        title="Preview"
        className="min-h-0 flex-1 border-0 bg-white"
      />
    </div>
  );
}
