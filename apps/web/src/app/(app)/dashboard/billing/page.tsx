'use client';

import { type PurchasablePlan, isLiveSubscription } from '@wintel/types';
import { Button } from '@wintel/ui';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PlanCards } from '@/components/plan-cards';
import { SubscriptionBanner } from '@/components/subscription-banner';
import { refusalMessage } from '@/lib/billing-messages';
import { useBilling, useOpenPortal, useStartCheckout } from '@/lib/use-billing';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

export default function BillingPage() {
  const billing = useBilling();
  const startCheckout = useStartCheckout();
  const openPortal = useOpenPortal();
  const searchParams = useSearchParams();

  const [activating, setActivating] = useState(false);
  const [activationTimedOut, setActivationTimedOut] = useState(false);

  // The plan arrives by webhook, not by this redirect, so returning from Checkout must not be
  // trusted on its own: this polls the billing state until the plan actually changes, and gives
  // up (rather than polling forever) after 30 seconds.
  useEffect(() => {
    if (searchParams.get('checkout') !== 'success' || billing.isPending || !billing.data) {
      return;
    }
    if (billing.data.plan !== 'free') {
      return;
    }

    setActivating(true);
    setActivationTimedOut(false);
    const startedAt = Date.now();

    const interval = setInterval(() => {
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setActivating(false);
        setActivationTimedOut(true);
        return;
      }
      void billing.refetch().then((result) => {
        if (result.data && result.data.plan !== 'free') {
          clearInterval(interval);
          setActivating(false);
        }
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // Only the arrival of ?checkout=success and the first successful load should (re)start the
    // poll; `billing.refetch`/`billing.data` are read fresh on each tick via the closure, not
    // through this dependency array, so including them would restart the interval every render.
  }, [searchParams, billing.isPending, billing.isSuccess]);

  const onSubscribe = (plan: PurchasablePlan) => {
    startCheckout.mutate(plan);
  };

  const onManage = () => {
    openPortal.mutate();
  };

  const checkoutErrorMessage = refusalMessage(startCheckout.error);
  const portalErrorMessage = refusalMessage(openPortal.error);
  // An abandoned checkout and a cancellation both leave a Subscription row behind. Offering to
  // subscribe must depend on whether one is live, or those users can never subscribe again.
  const hasSubscription = isLiveSubscription(billing.data?.subscription?.status);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="text-sm text-muted-foreground">
          What your organization can use, and how much of it you have used this month.
        </p>
      </header>

      {activating ? (
        <p role="status" className="text-sm text-muted-foreground">
          Activating your subscription…
        </p>
      ) : null}

      {searchParams.get('checkout') === 'cancelled' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checkout cancelled — nothing was charged. Pick a plan below whenever you are ready.
        </p>
      ) : null}

      {activationTimedOut ? (
        <p role="alert" className="text-sm text-destructive">
          This is taking longer than expected — refresh in a moment.
        </p>
      ) : null}

      {billing.isPending ? (
        <p className="text-sm text-muted-foreground">Loading your plan…</p>
      ) : billing.isError ? (
        <p className="text-sm text-destructive">Could not load your plan.</p>
      ) : (
        <>
          {billing.data.subscription ? (
            <SubscriptionBanner
              subscription={billing.data.subscription}
              onManage={onManage}
              pending={openPortal.isPending}
            />
          ) : null}

          {hasSubscription ? (
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={openPortal.isPending}
                onClick={onManage}
              >
                Manage billing
              </Button>
            </div>
          ) : null}

          <PlanCards
            current={billing.data.plan}
            plans={billing.data.plans}
            usage={billing.data.usage}
            hasSubscription={hasSubscription}
            onSubscribe={onSubscribe}
            pending={startCheckout.isPending}
          />

          <p className="text-sm text-muted-foreground">
            Downgrading stops scheduled scans on websites the new plan does not allow. Your websites
            are kept.
          </p>
        </>
      )}

      {checkoutErrorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {checkoutErrorMessage}
        </p>
      ) : null}

      {portalErrorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {portalErrorMessage}
        </p>
      ) : null}
    </div>
  );
}
