import Link from 'next/link';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="flex flex-col gap-4.5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          Confirm your address to start your first scan.
        </p>
      </header>

      <p className="rounded-lg bg-primary-soft px-4 py-3.5 text-sm leading-relaxed text-primary-soft-foreground">
        {email ? (
          <>
            We sent a link to <strong className="font-semibold">{email}</strong>. Open it to
            activate your account.
          </>
        ) : (
          'We sent you a verification link. Open it to activate your account.'
        )}
      </p>

      <p className="text-center text-[13px] text-muted-foreground">
        Verified already?{' '}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
