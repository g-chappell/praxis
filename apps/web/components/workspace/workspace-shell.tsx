'use client';

import { useEffect, useState } from 'react';
import {
  Group,
  type LayoutStorage,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';

import type { ChatAuthor } from '@/components/workspace/chat-message';
import { ChatPanel } from '@/components/workspace/chat-panel';
import { CodeEditor } from '@/components/workspace/code-editor';
import { FileTree } from '@/components/workspace/file-tree';
import { PresenceBar } from '@/components/workspace/presence-bar';
import { PreviewPane } from '@/components/workspace/preview-pane';
import { cn } from '@/lib/utils';
import { WorkspaceFilesProvider } from '@/components/workspace/workspace-files';
import { WorkspacePresenceProvider } from '@/components/workspace/workspace-presence';
import { WorkspaceSocketProvider } from '@/components/workspace/workspace-socket';

// Three-panel workspace shell (STORY-10): file tree | editor | chat, hosted on a
// single shared session socket. Pane sizes persist via `useDefaultLayout` so a
// resize survives a page refresh (TASK-030 acceptance). The file tree and editor
// are empty containers here — their data (sandbox watchFiles + Monaco) lands in
// TASK-031; this task owns only the layout + resizing.

const PANEL_IDS = ['files', 'editor', 'chat'];

// localStorage doesn't exist during Next's SSR of this client component; this
// no-op store keeps useDefaultLayout safe on the server (react-resizable-panels
// otherwise defaults storage to localStorage, which throws server-side).
const layoutStorage: LayoutStorage =
  typeof window === 'undefined' ? { getItem: () => null, setItem: () => {} } : window.localStorage;

export function WorkspaceShell({
  projectId,
  currentUser,
}: {
  projectId: string;
  currentUser: ChatAuthor;
}) {
  return (
    <WorkspaceSocketProvider projectId={projectId}>
      <WorkspaceFilesProvider>
        <WorkspacePresenceProvider>
          <ResizablePanels currentUser={currentUser} />
        </WorkspacePresenceProvider>
      </WorkspaceFilesProvider>
    </WorkspaceSocketProvider>
  );
}

function ResizablePanels({ currentUser }: { currentUser: ChatAuthor }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'praxis-workspace-panels',
    panelIds: PANEL_IDS,
    storage: layoutStorage,
  });

  // Mount the resizable Group client-side only. It initialises its layout from
  // the persisted sizes at mount, but localStorage isn't readable during SSR —
  // rendering it straight through hydration makes the Group lock in the default
  // sizes and ignore the saved layout, so a resize wouldn't survive a refresh.
  // The static fallback shows the same three columns for the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex h-full">
        <div className="flex min-w-0 basis-[20%] flex-col">
          <FilesPane />
        </div>
        <div className="w-1 bg-border" />
        <div className="flex min-w-0 basis-[52%] flex-col">
          <EditorPane />
        </div>
        <div className="w-1 bg-border" />
        <div className="flex min-w-0 basis-[28%] flex-col">
          <ChatPane currentUser={currentUser} />
        </div>
      </div>
    );
  }

  return (
    <Group
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="h-full"
    >
      <Panel id="files" defaultSize="20%" minSize="12%" className="flex min-w-0 flex-col">
        <FilesPane />
      </Panel>

      <ResizeHandle />

      <Panel id="editor" defaultSize="52%" minSize="30%" className="flex min-w-0 flex-col">
        <EditorPane />
      </Panel>

      <ResizeHandle />

      <Panel id="chat" defaultSize="28%" minSize="20%" className="flex min-w-0 flex-col">
        <ChatPane currentUser={currentUser} />
      </Panel>
    </Group>
  );
}

function FilesPane() {
  return (
    <>
      <PaneHeader>Files</PaneHeader>
      <PresenceBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </>
  );
}

function EditorPane() {
  const [tab, setTab] = useState<'editor' | 'preview'>('editor');
  return (
    <>
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <PaneTab active={tab === 'editor'} onClick={() => setTab('editor')}>
          Editor
        </PaneTab>
        <PaneTab active={tab === 'preview'} onClick={() => setTab('preview')}>
          Preview
        </PaneTab>
      </div>
      {/* Keep both mounted (hide the inactive one) so the preview's running app
          isn't reloaded on every tab switch. */}
      <div className={cn('min-h-0 flex-1', tab !== 'editor' && 'hidden')}>
        <CodeEditor />
      </div>
      <div className={cn('min-h-0 flex-1', tab !== 'preview' && 'hidden')}>
        <PreviewPane />
      </div>
    </>
  );
}

function PaneTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium uppercase tracking-wide',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

function ChatPane({ currentUser }: { currentUser: ChatAuthor }) {
  return (
    <>
      <PaneHeader>Chat</PaneHeader>
      <div className="min-h-0 flex-1 p-4">
        <ChatPanel currentUser={currentUser} />
      </div>
    </>
  );
}

function PaneHeader({ children }: { children: string }) {
  return (
    <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function ResizeHandle() {
  return (
    <Separator className="w-1 bg-border transition-colors hover:bg-primary/40 active:bg-primary/60" />
  );
}
