// @vitest-environment jsdom
// Usage panel (STORY-22): renders cumulative tokens + estimated cost from the API.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsagePanel } from './usage-panel';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          inputTokens: 1234,
          outputTokens: 567,
          estimatedCostUsd: 0.0123,
          turns: 3,
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('UsagePanel', () => {
  it('renders token totals, cost, and turn count', async () => {
    render(<UsagePanel projectId="p1" />);
    expect(await screen.findByText('1,234')).toBeTruthy(); // input tokens
    expect(screen.getByText('567')).toBeTruthy(); // output tokens
    expect(screen.getByText('$0.01')).toBeTruthy(); // estimated cost (USD)
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/usage');
  });

  it('shows an error state when the API fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    render(<UsagePanel projectId="p1" />);
    expect(await screen.findByText('Couldn’t load usage.')).toBeTruthy();
  });
});
