// @vitest-environment jsdom
// Settings Teams panel (STORY-54/55, TASK-164/168). Mocks the team endpoints +
// the router and asserts: zero teams → create form (POST + refresh); the create
// form stays available with teams; each team renders as its own card labelled by
// name with its members; an owner can rename inline (Save disabled until dirty,
// PATCH + refresh); a member's card name is read-only.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TeamForUser } from '@/lib/teams';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { TeamsPanel } from './team-card';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

const acme: TeamForUser = {
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
const beta: TeamForUser = {
  id: 't2',
  name: 'Beta',
  isOwner: false,
  members: [
    { userId: 'u3', email: 'lead@test.local', displayName: 'Lead', isOwner: true, joinedAt: null },
    {
      userId: 'u1',
      email: 'owner@test.local',
      displayName: 'Owner',
      isOwner: false,
      joinedAt: null,
    },
  ],
};

describe('TeamsPanel — no teams', () => {
  it('shows the create form; creating posts and refreshes', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ team: acme }), { status: 201 }));

    const { getByTestId, queryByTestId } = render(<TeamsPanel teams={[]} />);
    expect(getByTestId('team-create-form')).toBeTruthy();
    expect(queryByTestId('team-card')).toBeNull();

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

describe('TeamsPanel — multiple teams', () => {
  it('renders a card per team, each labelled by name, with create still available', () => {
    const { getAllByTestId, getByTestId } = render(<TeamsPanel teams={[acme, beta]} />);
    const cards = getAllByTestId('team-card');
    expect(cards).toHaveLength(2);
    expect(getAllByTestId('team-name').map((n) => n.textContent)).toEqual(['Acme', 'Beta']);
    // The create-another form stays available alongside existing teams.
    expect(getByTestId('team-create-form')).toBeTruthy();
  });

  it('falls back to email when a member has an empty/whitespace display name', () => {
    const blankName: TeamForUser = {
      id: 't3',
      name: 'Gamma',
      isOwner: true,
      members: [
        {
          userId: 'u9',
          email: 'solo@test.local',
          displayName: '  ',
          isOwner: true,
          joinedAt: null,
        },
      ],
    };
    const { getByTestId } = render(<TeamsPanel teams={[blankName]} />);
    expect(getByTestId('team-member-row').textContent).toContain('solo@test.local');
  });

  it('owner card renders the owner badge + an editable name; member card is read-only', () => {
    const { getAllByTestId } = render(<TeamsPanel teams={[acme, beta]} />);
    // Acme (owned) has a rename input; Beta (member) does not.
    expect(getAllByTestId('team-rename-input')).toHaveLength(1);
    expect((getAllByTestId('team-rename-input')[0] as HTMLInputElement).value).toBe('Acme');
    expect(getAllByTestId('team-member-owner-badge').length).toBeGreaterThanOrEqual(1);
  });
});

describe('TeamsPanel — rename', () => {
  it('disables Save until the name changes, then PATCHes the right team and refreshes', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ team: { ...acme, name: 'Acme Labs' } }), { status: 200 }),
      );

    const { getByTestId } = render(<TeamsPanel teams={[acme]} />);
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
