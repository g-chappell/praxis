'use client';

import { useEffect, useState } from 'react';
import {
  Group,
  type LayoutStorage,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';

import { ChatPanel } from '@/components/workspace/chat-panel';
import { CodeEditor } from '@/components/workspace/code-editor';
import { FileTree } from '@/components/workspace/file-tree';
import { WorkspaceFilesProvider } from '@/components/workspace/workspace-files';
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

export function WorkspaceShell({ projectId }: { projectId: string }) {
  return (
    <WorkspaceSocketProvider projectId={projectId}>
      <WorkspaceFilesProvider>
        <ResizablePanels />
      </WorkspaceFilesProvider>
    </WorkspaceSocketProvider>
  );
}

function ResizablePanels() {
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
          <ChatPane />
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
        <ChatPane />
      </Panel>
    </Group>
  );
}

function FilesPane() {
  return (
    <>
      <PaneHeader>Files</PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </>
  );
}

function EditorPane() {
  return (
    <>
      <PaneHeader>Editor</PaneHeader>
      <div className="min-h-0 flex-1">
        <CodeEditor />
      </div>
    </>
  );
}

function ChatPane() {
  return (
    <>
      <PaneHeader>Chat</PaneHeader>
      <div className="min-h-0 flex-1 p-4">
        <ChatPanel />
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
