// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A controllable fake socket so the test can emit server frames to subscribers.
const subscribers = new Set<(f: Record<string, unknown>) => void>();
function emit(frame: Record<string, unknown>) {
  act(() => {
    for (const s of subscribers) s(frame);
  });
}
vi.mock('@/components/workspace/workspace-socket', () => ({
  useWorkspaceSocket: () => ({
    status: 'connected',
    start: () => {},
    close: () => {},
    send: () => true,
    subscribe: (fn: (f: Record<string, unknown>) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  }),
}));

import { ChatPanel } from './chat-panel';
import { WorkspaceFilesProvider, useWorkspaceFiles } from './workspace-files';

afterEach(() => {
  cleanup();
  subscribers.clear();
});

const user = { name: 'Tester', image: null };

describe('file errors are scoped to the editor, not the chat (TASK-071)', () => {
  it('a file-scoped error (with a path) leaves the chat input enabled', () => {
    const { getByPlaceholderText, queryByText } = render(<ChatPanel currentUser={user} />);
    const input = getByPlaceholderText(/message as/i) as HTMLInputElement;
    expect(input.disabled).toBe(false);

    emit({ type: 'error', reason: 'save_failed', path: 'a.ts' });

    expect(input.disabled).toBe(false); // chat unaffected
    expect(queryByText('Session error')).toBeNull();
  });

  it('a session error (no path) disables the chat and shows Session error', () => {
    const { getByPlaceholderText, queryAllByText } = render(<ChatPanel currentUser={user} />);
    const input = getByPlaceholderText(/message as/i) as HTMLInputElement;

    emit({ type: 'error', reason: 'agent_error' });

    expect(input.disabled).toBe(true);
    expect(queryAllByText('Session error').length).toBeGreaterThan(0);
  });

  it('a save error surfaces on the open file in the files provider', () => {
    let snapshot: ReturnType<typeof useWorkspaceFiles> | undefined;
    function Probe() {
      snapshot = useWorkspaceFiles();
      return null;
    }
    render(
      <WorkspaceFilesProvider>
        <Probe />
      </WorkspaceFilesProvider>,
    );
    act(() => snapshot!.select('a.ts'));
    emit({ type: 'error', reason: 'save_failed', path: 'a.ts' });
    expect(snapshot!.error).toMatch(/save/i);
  });
});
