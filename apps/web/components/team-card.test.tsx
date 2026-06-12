// @vitest-environment jsdom
// Settings Team card (STORY-54/TASK-164). Mocks the team endpoints + the router
// and asserts: no team → create form (POST + refresh); has team → owner sees an
// editable name (Save disabled until dirty, PATCH + refresh) and the member list
// renders the owner badge; a non-owner sees the name read-only.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TeamForUser } from '@/lib/teams';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { TeamCard } from './team-card';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

const ownedTeam: TeamForUser = {
  id: 't1',
  name: 'Acme',
  isOwner: true,
  members: [
    {
      userId: 'u1',
      email: 'owner@test.local',
      displayName: 'Owner',
      isOwner: true,
      joinedAt: new Date('2026-01-01'),
    },
    {
      userId: 'u2',
      email: 'partner@test.local',
      displayName: null,
      isOwner: false,
      joinedAt: new Date('2026-02-01'),
    },
  ],
};

describe('TeamCard — no team', () => {
  it('shows the create form; creating posts and refreshes', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ team: ownedTeam }), { status: 201 }));

    const { getByTestId } = render(<TeamCard team={null} />);
    expect(getByTestId('team-create-form')).toBeTruthy();

    // Empty name keeps Submit disabled.
    expect((getByTestId('team-create-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(getByTestId('team-name-input'), { target: { value: '  Acme  ' } });
    expect((getByTestId('team-create-submit') as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(getByTestId('team-create-submit'));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/teams',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Acme' }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('TeamCard — owner', () => {
  it('renders members with an owner badge and an editable name', () => {
    const { getByTestId, getAllByTestId } = render(<TeamCard team={ownedTeam} />);
    expect(getAllByTestId('team-member-row')).toHaveLength(2);
    expect(getByTestId('team-member-owner-badge')).toBeTruthy();
    expect((getByTestId('team-rename-input') as HTMLInputElement).value).toBe('Acme');
  });

  it('disables Save until the name changes, then PATCHes and refreshes', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ team: { ...ownedTeam, name: 'Acme Labs' } }), {
        status: 200,
      }),
    );

    const { getByTestId } = render(<TeamCard team={ownedTeam} />);
    expect((getByTestId('team-rename-save') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(getByTestId('team-rename-input'), { target: { value: '  Acme Labs  ' } });
    expect((getByTestId('team-rename-save') as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(getByTestId('team-rename-save'));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/teams/t1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Acme Labs' }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('TeamCard — non-owner', () => {
  it('renders the name read-only (no rename input)', () => {
    const { queryByTestId, getByText } = render(
      <TeamCard team={{ ...ownedTeam, isOwner: false }} />,
    );
    expect(queryByTestId('team-rename-input')).toBeNull();
    expect(getByText('Acme')).toBeTruthy();
  });
});
