// @vitest-environment jsdom
// Workspace readiness loading overlay (STORY-51): the overlay reports the current
// blocking step and shows an error state when the connection fails.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let socket: {
  status: string;
  filesLoaded: boolean;
  previewReady: boolean;
};

vi.mock('@/components/workspace/workspace-socket', () => ({
  useWorkspaceSocket: () => socket,
}));

import { WorkspaceLoadingOverlay } from './workspace-loading';

afterEach(cleanup);

describe('WorkspaceLoadingOverlay', () => {
  it('shows "Connecting…" while the socket is not yet connected', () => {
    socket = { status: 'connecting', filesLoaded: false, previewReady: false };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Connecting to your workspace…')).toBeTruthy();
  });

  it('shows "Loading your files…" once connected but before the tree arrives', () => {
    socket = { status: 'connected', filesLoaded: false, previewReady: false };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Loading your files…')).toBeTruthy();
  });

  it('shows "Starting the preview…" once files are loaded but the dev server is not up', () => {
    socket = { status: 'connected', filesLoaded: true, previewReady: false };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Starting the preview…')).toBeTruthy();
  });

  it('shows an error state when the connection failed', () => {
    socket = { status: 'error', filesLoaded: false, previewReady: false };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Couldn’t start the workspace.')).toBeTruthy();
  });
});
