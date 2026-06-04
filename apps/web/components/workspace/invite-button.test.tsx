// @vitest-environment jsdom
// Owner invite UI (STORY-31/TASK-082). Mocks the create endpoint + clipboard and
// asserts the link surfaces and copies.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InviteButton } from './invite-button';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const INVITE_URL = 'https://praxis.test/invite/abc123';

describe('InviteButton', () => {
  it('creates a link on click and shows it with the expiry note', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'abc123', url: INVITE_URL }), { status: 200 }),
      );

    const { getByTestId, getByText } = render(<InviteButton projectId="p1" />);
    await act(async () => {
      fireEvent.click(getByTestId('workspace-invite-button'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/invites',
      expect.objectContaining({ method: 'POST' }),
    );
    const input = (await waitFor(() => getByTestId('invite-link-input'))) as HTMLInputElement;
    expect(input.value).toBe(INVITE_URL);
    expect(getByText(/expires in 7 days/i)).toBeTruthy();
  });

  it('copies the link to the clipboard and confirms', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: INVITE_URL }), { status: 200 }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { getByTestId } = render(<InviteButton projectId="p1" />);
    await act(async () => {
      fireEvent.click(getByTestId('workspace-invite-button'));
    });
    await waitFor(() => getByTestId('invite-copy-button'));
    await act(async () => {
      fireEvent.click(getByTestId('invite-copy-button'));
    });

    expect(writeText).toHaveBeenCalledWith(INVITE_URL);
    await waitFor(() => expect(getByTestId('invite-copy-button').textContent).toBe('Copied'));
  });

  it('shows an error when the request fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 403 }));

    const { getByTestId, getByText } = render(<InviteButton projectId="p1" />);
    await act(async () => {
      fireEvent.click(getByTestId('workspace-invite-button'));
    });

    expect(getByText(/could not create an invite link/i)).toBeTruthy();
  });
});
