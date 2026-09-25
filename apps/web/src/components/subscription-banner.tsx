'use client';

import type { SubscriptionSummary } from '@wintel/types';
import { Button } from '@wintel/ui';

function formatDate(iso: string): string {
  // Stripe's timestamps are UTC; rendering them in the viewer's zone shows a US customer their
  // plan expiring a day early.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * What the subscription needs the owner to know. A failed payment does NOT remove the plan —
 * Stripe keeps retrying — so this warns without claiming access is gone.
 */
export function SubscriptionBanner({
  subscription,
  onManage,
  pending,
}: {
  subscription: SubscriptionSummary;
  onManage: () => void;
  pending: boolean;
}) {
  // `incomplete` means a checkout was started and never paid — there is no payment to have
  // failed, and no plan to lose.
  const needsPayment = subscription.status === 'past_due';

  if (needsPayment) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-4 rounded-lg border border-destructive/40 bg-destructive-soft p-5"
      >
        <span
          aria-hidden="true"
          className="grid size-7 flex-none place-items-center rounded-md bg-card text-sm font-bold text-destructive-soft-foreground"
        >
          !
        </span>
        <div className="flex min-w-60 flex-1 flex-col gap-0.5 text-destructive-soft-foreground">
          <span className="text-sm font-semibold">Your last payment did not go through</span>
          <span className="text-[13px]">
            Your plan stays active while Stripe retries, but update your payment details to keep it.
          </span>
        </div>
        <Button variant="outline" size="sm" disabled={pending} onClick={onManage}>
          Update payment details
        </Button>
      </div>
    );
  }

  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-3.5 text-[13px]"
      >
        <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-semibold">Ending</span>
        <span className="flex-1">
          Your plan is cancelled and runs until {formatDate(subscription.currentPeriodEnd)}. After
          that you move to Free.
        </span>
        <Button variant="outline" size="sm" disabled={pending} onClick={onManage}>
          Keep it
        </Button>
      </div>
    );
  }

  return null;
}
