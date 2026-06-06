// POST /api/admin/api-keys — set or rotate the platform Anthropic API key
// (STORY-21). Admin-only. The raw key is encrypted by setActivePlatformKey before
// it touches the DB and is NEVER echoed back or logged — the response carries
// masked metadata only.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { getActivePlatformKeyMeta, setActivePlatformKey } from '@praxis/keys';

import { isUserAdmin } from '@/lib/admin';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return NextResponse.json({ error: 'missing_key' }, { status: 400 });
  }
  // Boundary validation only — Anthropic API keys carry this prefix.
  if (!key.startsWith('sk-ant-')) {
    return NextResponse.json({ error: 'invalid_key_format' }, { status: 400 });
  }

  await setActivePlatformKey(key, session.user.id);
  const meta = await getActivePlatformKeyMeta();
  // Audit the rotation (masked key only — never the raw secret).
  await recordAudit(session.user.id, 'api_key.rotated', {
    targetType: 'platform_api_key',
    targetId: 'platform',
    metadata: meta ? { maskedKey: meta.maskedKey } : {},
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ ok: true, meta });
}
