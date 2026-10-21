import Link from 'next/link';

import { SocialSignIn } from '@/components/social-sign-in';

import { SignInForm } from '@/components/sign-in-form';

/**
 * A verification link redirects here: `?verified=1` once confirmed, with `&error=<code>` added
 * when the link was expired or already used. Signing in from either state works out — an
 * unverified sign-in mails a fresh link.
 */
function VerificationNotice({ verified, error }: { verified?: string; error?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-warning-soft px-4 py-3.5 text-sm leading-relaxed text-warning-soft-foreground"
      >
        That verification link has expired or was already used. Sign in and we will send you a new
        one.
      </p>
    );
  }

  if (verified) {
    return (
      <p
        role="status"
        className="rounded-lg bg-success-soft px-4 py-3.5 text-sm leading-relaxed text-success-soft-foreground"
      >
        Email confirmed. Sign in to continue.
      </p>
    );
  }

  return null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const { verified, error } = await searchParams;

  return (
    <div className="flex flex-col gap-4.5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back.</p>
      </header>

      <VerificationNotice verified={verified} error={error} />

      <SocialSignIn />

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
