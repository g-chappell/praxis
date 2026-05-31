// Inline dev mailer for TASK-012. Writes the magic-link email to
// `.mail/<timestamp>-<recipient>.html` and logs the URL to stdout.
//
// TASK-013 extracts this into `lib/mailer/` with a Resend impl alongside;
// this file is short-lived. Kept narrow on purpose: the only call site
// is `lib/auth.ts`.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MAIL_DIR = resolve(process.cwd(), '.mail');

export async function sendMagicLinkEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<{ id: string }> {
  if (process.env.NODE_ENV === 'production') {
    // Loud-fail in production. TASK-013 introduces the Resend path; until
    // then, prod must not silently accept sign-in attempts.
    throw new Error(
      'Magic-link email cannot be sent in production: Resend not yet wired (TASK-013)',
    );
  }

  const safeRecipient = to.replace(/[^a-z0-9@._-]/gi, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${stamp}-${safeRecipient}.html`;
  const filepath = resolve(MAIL_DIR, filename);

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign in to Praxis</title></head>
<body style="font-family: sans-serif; padding: 2rem; max-width: 32rem;">
  <h1 style="margin-bottom: 1rem;">Sign in to Praxis</h1>
  <p>Click the link below to sign in. The link expires in 5 minutes.</p>
  <p style="margin: 2rem 0;">
    <a href="${url}" style="background:#0f172a;color:white;padding:0.75rem 1.5rem;border-radius:0.5rem;text-decoration:none;">
      Sign in to Praxis
    </a>
  </p>
  <p style="color: #64748b; font-size: 0.875rem;">
    If you didn't request this, you can safely ignore this email.
  </p>
</body>
</html>`;

  await mkdir(MAIL_DIR, { recursive: true });
  await writeFile(filepath, html, 'utf8');

  process.stdout.write(`[dev-mailer] wrote ${filepath}\n`);
  process.stdout.write(`[dev-mailer] magic-link URL: ${url}\n`);

  return { id: `dev-${crypto.randomUUID()}` };
}
