import { SignInForm } from '@/components/sign-in-form';

export const metadata = {
  title: 'Sign in to Praxis',
};

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to Praxis</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;ll email you a one-time sign-in link.
          </p>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
