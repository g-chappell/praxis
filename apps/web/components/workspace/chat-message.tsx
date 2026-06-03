import { cn } from '@/lib/utils';

// Typed chat messages + their presentational rendering (TASK-032). Pure (no
// socket), so ChatPanel feeds it state and the snapshot test renders it directly.
// Each message is attributed to the prompting user (avatar + name); agent-produced
// kinds carry an "Agent" tag so they read distinctly from the user's own prompt.

export interface ChatAuthor {
  name: string;
  image?: string | null;
}

export type ChatMessage =
  | { id: string; kind: 'user'; author: ChatAuthor; text: string }
  | { id: string; kind: 'text'; author: ChatAuthor; text: string }
  | { id: string; kind: 'tool_call'; author: ChatAuthor; title: string }
  | { id: string; kind: 'file_change'; author: ChatAuthor; change: string; path: string }
  | { id: string; kind: 'error'; author: ChatAuthor; text: string };

/** Up to two initials from a display name (or email local-part) for the avatar. */
export function initials(name: string): string {
  const base = name.includes('@') ? name.slice(0, name.indexOf('@')) : name;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const picked =
    parts.length >= 2
      ? `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`
      : (parts[0] ?? base).slice(0, 2);
  return picked.toUpperCase() || '?';
}

export function Avatar({ name, image }: ChatAuthor) {
  if (image) {
    // Plain <img>: avatar URLs are external (gravatar/OAuth), no Next loader.
    return <img src={image} alt={name} className="h-6 w-6 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-foreground"
    >
      {initials(name)}
    </span>
  );
}

const AGENT_KINDS = new Set<ChatMessage['kind']>(['text', 'tool_call', 'file_change', 'error']);

export function ChatMessageView({ message }: { message: ChatMessage }) {
  const isAgent = AGENT_KINDS.has(message.kind);
  return (
    <li className="flex gap-2 text-sm">
      <Avatar name={message.author.name} image={message.author.image} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{message.author.name}</span>
          {isAgent && (
            <span className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Agent
            </span>
          )}
        </div>
        <MessageBody message={message} />
      </div>
    </li>
  );
}

function MessageBody({ message }: { message: ChatMessage }) {
  switch (message.kind) {
    case 'user':
    case 'text':
      return <p className="whitespace-pre-wrap break-words">{message.text}</p>;
    case 'tool_call':
      return (
        <p className="text-muted-foreground">
          <span aria-hidden>🔧 </span>Ran <span className="font-medium">{message.title}</span>
        </p>
      );
    case 'file_change':
      return (
        <p className="text-muted-foreground">
          <span aria-hidden>✎ </span>
          {message.change} <span className="font-mono text-xs">{message.path}</span>
        </p>
      );
    case 'error':
      return <p className="text-destructive">{message.text}</p>;
  }
}

export function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  return (
    <ul className={cn('flex-1 space-y-3 overflow-y-auto')}>
      {messages.map((message) => (
        <ChatMessageView key={message.id} message={message} />
      ))}
    </ul>
  );
}
