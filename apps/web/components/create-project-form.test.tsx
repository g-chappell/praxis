// @vitest-environment jsdom
// Create-project guidance for a teamless user (STORY-54/TASK-165): when the user
// has no team the popover shows create-or-join-a-team guidance linking to
// /settings (never the form), and a POST that races to 409 needs_team falls back
// to the same guidance instead of a generic error.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { CreateProjectForm } from './create-project-form';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});

describe('CreateProjectForm — teamless guidance', () => {
  it('shows the create-or-join-a-team guidance (not the form) when hasTeam is false', () => {
    const { getByText, getByTestId, queryByLabelText } = render(
      <CreateProjectForm hasTeam={false} />,
    );
    fireEvent.click(getByText('New project'));

    const guidance = getByTestId('needs-team-guidance');
    expect(guidance).toBeTruthy();
    expect(guidance.querySelector('a[href="/settings"]')).toBeTruthy();
    // The project form never renders for a teamless user.
    expect(queryByLabelText('Name')).toBeNull();
  });

  it('falls back to the guidance when the POST returns 409 needs_team', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'needs_team' }), { status: 409 }),
    );

    const { getByText, getByTestId, getByPlaceholderText } = render(<CreateProjectForm />);
    fireEvent.click(getByText('New project'));
    fireEvent.change(getByPlaceholderText('Untitled project'), { target: { value: 'My scene' } });
    await act(async () => {
      fireEvent.click(getByText('Create project'));
    });

    await waitFor(() => getByTestId('needs-team-guidance'));
    expect(push).not.toHaveBeenCalled();
  });
});
