import Link from 'next/link';

import { SignInForm } from '@/components/sign-in-form';

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back to the platform.</p>
      </header>

      <SignInForm />

      <p className="text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">
          Create one
        </Link>
      </p>
    </div>
  );
}
