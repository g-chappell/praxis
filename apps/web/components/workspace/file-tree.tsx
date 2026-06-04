'use client';

import { useMemo, useState } from 'react';

import { type TreeNode, buildTree } from '@/components/workspace/file-tree-model';
import { useWorkspaceFiles } from '@/components/workspace/workspace-files';
import { useWorkspacePresence } from '@/components/workspace/workspace-presence';
import { cn } from '@/lib/utils';

/** A file's lock for the tree: who holds it, and whether that's this client. */
export interface LockBadge {
  ownerName: string;
  isMine: boolean;
}

// The file tree pane (TASK-031): renders the sandbox's files (fed by the
// orchestrator over the socket) as collapsible folders + clickable files. Locked
// files show a 🔒 badge with the owner (STORY-11/TASK-034).
export function FileTree() {
  const { files, selectedPath, select } = useWorkspaceFiles();
  const { locks, members, myUserId } = useWorkspacePresence();
  const tree = useMemo(() => buildTree(files), [files]);

  const lockByPath = useMemo(() => {
    const map = new Map<string, LockBadge>();
    for (const lock of locks) {
      const owner = members.find((m) => m.userId === lock.userId);
      const isMine = lock.userId === myUserId;
      map.set(lock.path, { ownerName: isMine ? 'you' : (owner?.userName ?? 'someone'), isMine });
    }
    return map;
  }, [locks, members, myUserId]);

  if (files.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">No files yet</div>;
  }

  return (
    <ul className="py-1 text-sm">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={select}
          lockByPath={lockByPath}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  lockByPath,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  lockByPath: Map<string, LockBadge>;
}) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === 'dir') {
    return (
      <li>
        <button
          type="button"
          style={indent}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1 py-0.5 pr-2 text-left text-muted-foreground hover:bg-accent"
        >
          <span className="w-3 shrink-0 text-xs">{open ? '▾' : '▸'}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children && (
          <ul>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                lockByPath={lockByPath}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const lock = lockByPath.get(node.path);
  return (
    <li>
      <button
        type="button"
        style={indent}
        onClick={() => onSelect(node.path)}
        title={lock ? `Locked by ${lock.ownerName}` : undefined}
        className={cn(
          'flex w-full items-center gap-1 py-0.5 pr-2 text-left hover:bg-accent',
          node.path === selectedPath && 'bg-accent font-medium',
        )}
      >
        <span className="truncate">{node.name}</span>
        {lock && (
          <span
            aria-label={`Locked by ${lock.ownerName}`}
            className={cn('shrink-0 text-xs', lock.isMine ? 'opacity-60' : 'text-amber-500')}
          >
            🔒
          </span>
        )}
      </button>
    </li>
  );
}
