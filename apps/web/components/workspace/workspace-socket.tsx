'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

// The single session WebSocket for the whole workspace shell (STORY-10). The
// file tree, editor, and chat panel all share this one connection: the provider
// mints a session (POST /api/sessions → one-time ticket + wsUrl), opens the WS,
// and fans every inbound frame out to subscribers. Lifted out of ChatPanel
// (STORY-09) so the three panes don't each open their own socket.

export type WorkspaceStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** A parsed inbound frame. Shape is validated by each subscriber, not here. */
export type ServerFrame = { type?: string; [key: string]: unknown };

interface WorkspaceSocket {
  status: WorkspaceStatus;
  /** Open the session + socket. No-op if already connecting/connected. */
  start: () => void;
  /** Close the socket; the server ends the session when the last client leaves. */
  close: () => void;
  /** Send a JSON message. Returns false if the socket isn't open. */
  send: (msg: Record<string, unknown>) => boolean;
  /** Subscribe to inbound frames. Returns an unsubscribe fn. */
  subscribe: (fn: (frame: ServerFrame) => void) => () => void;
  /** The project's preview URL (the sandbox dev server), or null until minted. */
  previewUrl: string | null;
}

const WorkspaceSocketContext = createContext<WorkspaceSocket | null>(null);

export function useWorkspaceSocket(): WorkspaceSocket {
  const ctx = useContext(WorkspaceSocketContext);
  if (!ctx) {
    throw new Error('useWorkspaceSocket must be used within <WorkspaceSocketProvider>');
  }
  return ctx;
}

export function WorkspaceSocketProvider({
  projectId,
  autoStart = true,
  children,
}: {
  projectId: string;
  autoStart?: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<WorkspaceStatus>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribers = useRef(new Set<(frame: ServerFrame) => void>());

  const subscribe = useCallback((fn: (frame: ServerFrame) => void) => {
    subscribers.current.add(fn);
    return () => {
      subscribers.current.delete(fn);
    };
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const start = useCallback(async () => {
    // Guard against double-open (auto-start effect + a manual retry).
    if (wsRef.current || status === 'connecting' || status === 'connected') return;
    setStatus('connecting');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      // wsUrl is resolved server-side at runtime (not a NEXT_PUBLIC_* build
      // inline) so it's configurable without rebuilding the web image.
      const {
        ticket,
        wsUrl,
        previewUrl: pv,
      } = (await res.json()) as {
        ticket: string;
        wsUrl?: string;
        previewUrl?: string | null;
      };
      setPreviewUrl(pv ?? null);
      if (!wsUrl) {
        setStatus('error');
        return;
      }
      const ws = new WebSocket(`${wsUrl}?ticket=${encodeURIComponent(ticket)}`);
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onmessage = (e) => {
        let frame: ServerFrame;
        try {
          frame = JSON.parse(String(e.data)) as ServerFrame;
        } catch {
          return; // ignore malformed frames
        }
        for (const fn of subscribers.current) fn(frame);
      };
      ws.onerror = () => setStatus('error');
      ws.onclose = () => {
        wsRef.current = null;
        setStatus((s) => (s === 'error' ? s : 'idle'));
      };
    } catch {
      setStatus('error');
    }
  }, [projectId, status]);

  const close = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Auto-open on mount so opening the project renders a live workspace (the
  // file tree mirrors the sandbox — STORY-10 AC). Closes on unmount so
  // navigating away ends the session (server stops the sandbox when the last
  // socket leaves).
  useEffect(() => {
    if (autoStart) void start();
    return () => close();
    // Keyed on projectId only: re-running on every status change would thrash
    // the connection. start/close read the latest values via refs/state.
  }, [projectId]);

  return (
    <WorkspaceSocketContext.Provider value={{ status, start, close, send, subscribe, previewUrl }}>
      {children}
    </WorkspaceSocketContext.Provider>
  );
}
