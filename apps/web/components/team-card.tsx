'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stamp } from '@/components/ui/stamp';
import type { TeamForUser, TeamMember } from '@/lib/teams';

// Team management on /settings (STORY-54/55). A user may own and belong to
// multiple teams, so this renders a panel: an always-available create form plus
// one card per team (each labelled with its name and its members by name). The
// owner of a team can rename it inline; a member sees it read-only. Name bound to
// TEAM_NAME_MAX in lib/teams.ts (inlined — that module pulls in the server-only
// db client). Per-team invite/remove/leave controls come in STORY-56.
const TEAM_NAME_MAX = 60;

export function TeamsPanel({ teams }: { teams: TeamForUser[] }) {
  return (
    <section data-testid="teams-panel" className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium">Teams</h2>
        <p className="text-sm text-muted-foreground">
          Build together — projects belong to a team, not a person. You can create or join more than
          one.
        </p>
      </div>

      <CreateTeam hasTeams={teams.length > 0} />

      {teams.map((team) => (
        <TeamCard key={team.id} team={team} />
      ))}
    </section>
  );
}

function CreateTeam({ hasTeams }: { hasTeams: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Could not create the team. Try again.');
        return;
      }
      setName('');
      setPending(false);
      router.refresh();
    } catch {
      setPending(false);
      setError('Could not create the team. Try again.');
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-5">
      {hasTeams ? (
        <h3 className="font-medium">Create another team</h3>
      ) : (
        <p className="text-sm text-muted-foreground">
          You don&apos;t have a team yet. Create one to start building, or ask a teammate for an
          invite link.
        </p>
      )}
      <form data-testid="team-create-form" onSubmit={onSubmit} className="space-y-2">
        <Input
          data-testid="team-name-input"
          value={name}
          maxLength={TEAM_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          aria-label="Team name"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          variant="stamp"
          size="sm"
          data-testid="team-create-submit"
          disabled={pending || !name.trim()}
        >
          {pending ? 'Creating…' : 'Create team'}
        </Button>
      </form>
    </div>
  );
}

function TeamCard({ team }: { team: TeamForUser }) {
  return (
    <div data-testid="team-card" className="space-y-4 rounded-lg border p-5">
      <h3 data-testid="team-name" className="text-lg font-semibold">
        {team.name}
      </h3>

      {team.isOwner && <RenameTeam teamId={team.id} name={team.name} />}

      <ul className="divide-y rounded-md border">
        {team.members.map((member) => (
          <MemberRow key={member.userId} member={member} />
        ))}
      </ul>
    </div>
  );
}

function RenameTeam({ teamId, name: initialName }: { teamId: string; name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== initialName && name.trim().length > 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Could not rename the team. Try again.');
        return;
      }
      setPending(false);
      router.refresh();
    } catch {
      setPending(false);
      setError('Could not rename the team. Try again.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label
        htmlFor={`team-rename-${teamId}`}
        className="text-xs font-medium text-muted-foreground"
      >
        Rename team
      </label>
      <div className="flex items-start gap-2">
        <Input
          id={`team-rename-${teamId}`}
          data-testid="team-rename-input"
          value={name}
          maxLength={TEAM_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          variant="stamp"
          size="sm"
          data-testid="team-rename-save"
          disabled={pending || !dirty}
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  // Display name falls back to email when absent — and an empty/whitespace
  // display name counts as absent (Better Auth seeds it to '' on signup, not
  // null, so `?? email` alone would render a blank row).
  const name = member.displayName?.trim();
  return (
    <li data-testid="team-member-row" className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name || member.email}</p>
        {name && name !== member.email && (
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {member.isOwner ? (
          <Stamp data-testid="team-member-owner-badge">Owner</Stamp>
        ) : (
          <Stamp>Partner</Stamp>
        )}
        {member.joinedAt && (
          <span className="text-xs text-muted-foreground">
            Joined {member.joinedAt.toLocaleDateString()}
          </span>
        )}
      </div>
    </li>
  );
}
