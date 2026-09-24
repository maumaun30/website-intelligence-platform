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
        className="flex flex-col gap-2 rounded-lg border border-destructive p-4 text-sm"
      >
        <p>
          Your last payment did not go through. Your plan stays active while Stripe retries, but
          update your payment details to keep it.
        </p>
        <div>
          <Button variant="outline" size="sm" disabled={pending} onClick={onManage}>
            Update payment details
          </Button>
        </div>
      </div>
    );
  }

  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Your plan is cancelled and runs until {formatDate(subscription.currentPeriodEnd)}.
      </p>
    );
  }

  return null;
}
