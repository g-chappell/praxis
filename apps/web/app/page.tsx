import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Praxis</h1>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
          A collaborative workspace where two people build, deploy, and learn together with AI
          coding agents. Pick a template, prompt the agent together, and end the session with a
          working app at a live preview URL — without needing to be developers.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-4">
          <Button asChild size="lg">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
