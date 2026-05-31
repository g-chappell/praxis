import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Check your email — Praxis',
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const safeEmail = email && /^[^<>]+$/.test(email) ? email : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-muted-foreground">
          {safeEmail ? (
            <>
              We sent a sign-in link to <span className="font-medium">{safeEmail}</span>.
            </>
          ) : (
            <>We sent a sign-in link to your inbox.</>
          )}{' '}
          The link expires in 5 minutes.
        </p>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive the email? Check your spam folder or{' '}
          <Link href="/signin" className="underline">
            request a new link
          </Link>
          .
        </p>
        <Button asChild variant="ghost">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
