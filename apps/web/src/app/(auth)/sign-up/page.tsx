import Link from 'next/link';

import { SignUpForm } from '@/components/sign-up-form';

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-4.5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Create your account</h1>
        <p className="text-sm text-muted-foreground">Your first site is free. No card needed.</p>
      </header>

      <SignUpForm />

      <p className="text-center text-[13px] text-muted-foreground">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
