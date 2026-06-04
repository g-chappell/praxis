'use client';

import { Avatar } from '@/components/workspace/chat-message';
import { uniqueByUser, useWorkspacePresence } from '@/components/workspace/workspace-presence';
import { cn } from '@/lib/utils';

// The live presence roster (STORY-11/TASK-033), shown in the files-pane header:
// every user currently in the project, with avatar + name and the file they're
// viewing. This client is tagged "you".
export function PresenceBar() {
  const { members, myConnId } = useWorkspacePresence();
  const people = uniqueByUser(members);
  if (people.length === 0) return null;

  const myUserId = members.find((m) => m.connId === myConnId)?.userId ?? null;

  return (
    <ul className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      {people.map((m) => {
        const isMe = m.userId === myUserId;
        return (
          <li
            key={m.userId}
            className={cn(
              'flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs',
              isMe ? 'border-primary/40 bg-primary/5' : 'border-border',
            )}
            title={m.filePath ? `${m.userName} — ${m.filePath}` : m.userName}
          >
            <Avatar name={m.userName} image={m.userImage} />
            <span className="max-w-[8rem] truncate font-medium">
              {m.userName}
              {isMe && <span className="text-muted-foreground"> (you)</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
