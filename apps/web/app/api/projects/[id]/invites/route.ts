// POST /api/projects/[id]/invites — mint a shareable, single-use invite link for
// the project (STORY-31). Authenticated + team-ownership-checked (in createInvite).
// Returns { code, url, expiresAt }; the browser shares the url out-of-band.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { ForbiddenError, createInvite } from '@/lib/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const h = await headers();
  const session = await getAuth().api.getSession({ headers: h });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { code, expiresAt } = await createInvite(session.user.id, params.id);
    // Build the public link from the forwarded host (behind Caddy) so the code
    // resolves the same way the user reached the app.
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
    const url = `${origin}/invite/${code}`;
    return NextResponse.json({ code, url, expiresAt });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw err;
  }
}
