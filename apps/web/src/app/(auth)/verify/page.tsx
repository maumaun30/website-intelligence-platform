import Link from 'next/link';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          {email
            ? `We sent a verification link to ${email}. Open it to activate your account.`
            : 'We sent you a verification link. Open it to activate your account.'}
        </p>
      </header>

      <p className="text-sm text-muted-foreground">
        Verified already?{' '}
        <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
