'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Avatar,
  type ChatAuthor,
  type ChatMessage,
  ChatTranscript,
} from '@/components/workspace/chat-message';
import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';

// Session chat (STORY-09 → STORY-10), reading the shared workspace socket. Renders
// the agent's typed event kinds (text / tool_call / file_change / error) and the
// user's prompts, each attributed to the prompting user (TASK-032). No interactive
// tool permissions yet (auto-allowed).
export function ChatPanel({ currentUser }: { currentUser: ChatAuthor }) {
  const { status: socketStatus, start, close, send, subscribe } = useWorkspaceSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [errored, setErrored] = useState(false);
  // True while the agent is streaming a `text` run; reset by any non-text event
  // so the next text-chunk starts a fresh message.
  const streamingRef = useRef(false);
  const idRef = useRef(0);
  const nextId = useCallback(() => `m${(idRef.current += 1)}`, []);

  // The prompting user for agent attribution. Single-client today, so it's always
  // the current user; the orchestrator would tag events per-user for multiplayer.
  const authorRef = useRef(currentUser);
  authorRef.current = currentUser;

  // An app-level error frame surfaces as an error state without tearing down the
  // shared connection (mirrors STORY-09's behaviour on the dedicated socket).
  const status = errored ? 'error' : socketStatus;

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const appendAgentText = useCallback(
    (chunk: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (streamingRef.current && last && last.kind === 'text') {
          return [...prev.slice(0, -1), { ...last, text: last.text + chunk }];
        }
        streamingRef.current = true;
        return [...prev, { id: nextId(), kind: 'text', author: authorRef.current, text: chunk }];
      });
    },
    [nextId],
  );

  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      if (frame.type === 'agent_event') {
        const event = frame.event as Record<string, unknown> | undefined;
        const author = authorRef.current;
        switch (event?.type) {
          case 'text-chunk':
            appendAgentText(typeof event.text === 'string' ? event.text : '');
            return;
          case 'tool-call':
            streamingRef.current = false;
            pushMessage({
              id: nextId(),
              kind: 'tool_call',
              author,
              title: typeof event.title === 'string' ? event.title : 'tool',
            });
            return;
          case 'file-change':
            streamingRef.current = false;
            pushMessage({
              id: nextId(),
              kind: 'file_change',
              author,
              change: typeof event.change === 'string' ? event.change : 'modify',
              path: typeof event.path === 'string' ? event.path : '',
            });
            return;
          case 'error':
            streamingRef.current = false;
            pushMessage({
              id: nextId(),
              kind: 'error',
              author,
              text: typeof event.message === 'string' ? event.message : 'Agent error',
            });
            return;
          case 'turn-complete':
            streamingRef.current = false;
            return;
        }
      } else if (frame.type === 'error' && frame.path === undefined) {
        // Only session-scoped errors (no `path`) touch the chat. File read/save
        // errors carry a `path` and are surfaced in the editor instead, so a
        // failed save never poisons the chat or disables the input (TASK-071).
        streamingRef.current = false;
        setErrored(true);
        pushMessage({
          id: nextId(),
          kind: 'error',
          author: authorRef.current,
          text: 'Session error',
        });
      }
    });
  }, [subscribe, appendAgentText, pushMessage, nextId]);

  function sendPrompt(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (!send({ type: 'prompt', text })) return;
    streamingRef.current = false;
    pushMessage({ id: nextId(), kind: 'user', author: currentUser, text });
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

      <ChatTranscript messages={messages} />

      <form onSubmit={sendPrompt} className="flex items-center gap-2">
        <Avatar name={currentUser.name} image={currentUser.image} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message as ${currentUser.name}…`}
          disabled={status !== 'connected'}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={status !== 'connected' || input.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  );
}
