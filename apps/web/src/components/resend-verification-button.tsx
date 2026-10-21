'use client';

import { Button } from '@wintel/ui';
import { useEffect, useState } from 'react';

import { sendVerificationEmail, verifiedCallbackURL } from '@/lib/auth-client';

/** Long enough that an impatient double-click does not send two emails, short enough to retry. */
const COOLDOWN_SECONDS = 60;

/**
 * For the user whose first verification email never arrived. The API answers the same whether or
 * not the address has an account, so this reveals nothing about which addresses are registered.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onClick() {
    setError(null);
    setPending(true);
    const result = await sendVerificationEmail({ email, callbackURL: verifiedCallbackURL() });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? 'Could not send the email. Try again shortly.');
      return;
    }

    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={onClick} disabled={pending || cooldown > 0}>
        {pending
          ? 'Sending…'
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : 'Resend verification email'}
      </Button>
      {cooldown > 0 ? (
        <p role="status" className="text-center text-[13px] text-muted-foreground">
          New link sent. It can take a minute to arrive; check spam too.
        </p>
      ) : null}
      {error === null ? null : (
        <p
          role="alert"
          className="rounded-lg bg-destructive-soft px-3 py-2.5 text-[13px] leading-snug font-medium text-destructive-soft-foreground"
        >
          {error}
        </p>
      )}
    </div>
  );
}
