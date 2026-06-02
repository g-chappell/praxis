'use client';

import { type FormEvent, useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

type Status = 'idle' | 'connecting' | 'connected' | 'error';
interface Message {
  role: 'user' | 'assistant';
  text: string;
}

// Minimal session chat (STORY-09): start a session (gets a one-time ticket),
// open the orchestrator WS, send prompts, render streamed text. No file
// tree/editor yet (STORY-10), no interactive tool permissions (auto-allowed).
export function ChatPanel({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  // Append to the in-flight assistant message (the last one), or start one.
  const appendAssistant = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', text: last.text + chunk }];
      }
      return [...prev, { role: 'assistant', text: chunk }];
    });
  }, []);

  const handleServerMessage = useCallback(
    (data: unknown) => {
      if (typeof data !== 'object' || data === null) return;
      const msg = data as { type?: string; event?: { type?: string; text?: string } };
      if (msg.type === 'agent_event' && msg.event?.type === 'text-chunk') {
        appendAssistant(msg.event.text ?? '');
      } else if (msg.type === 'error') {
        setStatus('error');
      }
    },
    [appendAssistant],
  );

  const start = useCallback(async () => {
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
      // wsUrl comes from the server (runtime env) — not a NEXT_PUBLIC_* build
      // inline — so it's configurable without rebuilding the web image.
      const { ticket, wsUrl } = (await res.json()) as { ticket: string; wsUrl?: string };
      if (!wsUrl) {
        setStatus('error');
        return;
      }
      const ws = new WebSocket(`${wsUrl}?ticket=${encodeURIComponent(ticket)}`);
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onmessage = (e) => {
        try {
          handleServerMessage(JSON.parse(String(e.data)));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onerror = () => setStatus('error');
      ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'idle'));
    } catch {
      setStatus('error');
    }
  }, [projectId, handleServerMessage]);

  function sendPrompt(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    const ws = wsRef.current;
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [...prev, { role: 'user', text }]);
    ws.send(JSON.stringify({ type: 'prompt', text }));
    setInput('');
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {status === 'idle' || status === 'connecting' ? (
        <Button onClick={start} disabled={status === 'connecting'}>
          {status === 'connecting' ? 'Starting…' : 'Start session'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {status === 'connected' ? 'Session connected' : 'Session error'}
        </p>
      )}

      <ul className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium">{m.role === 'user' ? 'You' : 'Agent'}: </span>
            <span className="whitespace-pre-wrap">{m.text}</span>
          </li>
        ))}
      </ul>

      <form onSubmit={sendPrompt} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say hello…"
          disabled={status !== 'connected'}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={status !== 'connected' || input.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  );
}
