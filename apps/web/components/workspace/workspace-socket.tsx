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
  // Connect resilience: a fresh session occasionally fails its first WS open
  // (transient upgrade/timing) and needed a manual page refresh. Auto-retry a
  // failed connect with backoff instead.
  const connectingRef = useRef(false); // an attempt (POST + WS open) is in flight
  const retriesRef = useRef(0);
  const closingRef = useRef(false); // intentional close (unmount/End session) — don't retry
  const startRef = useRef<() => void>(() => {});
  const RETRY_MAX = 4;

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

  // A connect attempt failed transiently (POST error or the WS never opened) —
  // back off and retry, up to RETRY_MAX, before surfacing an error.
  const scheduleRetry = useCallback(() => {
    connectingRef.current = false;
    if (closingRef.current) return;
    if (retriesRef.current >= RETRY_MAX) {
      setStatus('error');
      return;
    }
    retriesRef.current += 1;
    setStatus('connecting'); // stay "connecting" through the backoff
    const delay = 500 * 2 ** (retriesRef.current - 1); // 0.5s, 1s, 2s, 4s
    setTimeout(() => {
      if (!closingRef.current) startRef.current();
    }, delay);
  }, []);

  const start = useCallback(async () => {
    // One in-flight attempt at a time; never re-open over a live socket.
    if (wsRef.current || connectingRef.current) return;
    connectingRef.current = true;
    setStatus('connecting');

    let res: Response | null = null;
    try {
      res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      res = null;
    }
    if (!res || !res.ok) {
      scheduleRetry();
      return;
    }

    // wsUrl is resolved server-side at runtime (not a NEXT_PUBLIC_* build inline)
    // so it's configurable without rebuilding the web image.
    const {
      ticket,
      wsUrl,
      previewUrl: pv,
    } = (await res.json().catch(() => ({}))) as {
      ticket?: string;
      wsUrl?: string;
      previewUrl?: string | null;
    };
    setPreviewUrl(pv ?? null);
    if (!wsUrl || !ticket) {
      // Misconfiguration, not transient — don't hammer it.
      connectingRef.current = false;
      setStatus('error');
      return;
    }

    let opened = false;
    const ws = new WebSocket(`${wsUrl}?ticket=${encodeURIComponent(ticket)}`);
    wsRef.current = ws;
    ws.onopen = () => {
      opened = true;
      connectingRef.current = false;
      retriesRef.current = 0;
      setStatus('connected');
    };
    ws.onmessage = (e) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(e.data)) as ServerFrame;
      } catch {
        return; // ignore malformed frames
      }
      for (const fn of subscribers.current) fn(frame);
    };
    ws.onerror = () => {}; // onclose drives state + retry
    ws.onclose = () => {
      wsRef.current = null;
      if (closingRef.current) {
        setStatus('idle');
      } else if (opened) {
        setStatus('idle'); // was connected then dropped — a manual Start reconnects
      } else {
        scheduleRetry(); // never opened → transient → retry
      }
    };
  }, [projectId, scheduleRetry]);

  startRef.current = start;

  const close = useCallback(() => {
    closingRef.current = true;
    connectingRef.current = false;
    retriesRef.current = 0;
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Auto-open on mount so opening the project renders a live workspace (the
  // file tree mirrors the sandbox — STORY-10 AC). Closes on unmount so
  // navigating away ends the session (server stops the sandbox when the last
  // socket leaves).
  useEffect(() => {
    closingRef.current = false;
    retriesRef.current = 0;
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
