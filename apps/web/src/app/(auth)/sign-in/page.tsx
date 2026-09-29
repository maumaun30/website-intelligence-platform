import Link from 'next/link';

import { SignInForm } from '@/components/sign-in-form';

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-4.5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back.</p>
      </header>

      <SignInForm />

      <p className="text-center text-[13px] text-muted-foreground">
        New to Wintel?{' '}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
