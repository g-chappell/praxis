'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

// Session chat (STORY-09), now reading the shared workspace socket (STORY-10):
// the file tree, editor, and chat panes share the one connection minted by
// <WorkspaceSocketProvider>. This pane sends prompts and renders streamed text;
// it no longer opens its own WebSocket. No interactive tool permissions yet
// (auto-allowed).
export function ChatPanel() {
  const { status: socketStatus, start, close, send, subscribe } = useWorkspaceSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [errored, setErrored] = useState(false);

  // An app-level error frame surfaces as an error state without tearing down the
  // shared connection (mirrors STORY-09's behaviour on the dedicated socket).
  const status = errored ? 'error' : socketStatus;

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

  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      if (frame.type === 'agent_event') {
        const event = frame.event as { type?: string; text?: string } | undefined;
        if (event?.type === 'text-chunk') appendAssistant(event.text ?? '');
      } else if (frame.type === 'error') {
        setErrored(true);
      }
    });
  }, [subscribe, appendAssistant]);

  function sendPrompt(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (!send({ type: 'prompt', text })) return;
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {status === 'idle' || status === 'connecting' ? (
        <Button
          onClick={() => {
            setErrored(false);
            start();
          }}
          disabled={status === 'connecting'}
        >
          {status === 'connecting' ? 'Starting…' : 'Start session'}
        </Button>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {status === 'connected' ? 'Session connected' : 'Session error'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              close();
              setErrored(false);
            }}
          >
            End session
          </Button>
        </div>
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
