'use client';

import { type PurchasablePlan, isLiveSubscription } from '@wintel/types';
import { Button } from '@wintel/ui';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PlanCards } from '@/components/plan-cards';
import { UsageBar } from '@/components/usage-bar';
import { SubscriptionBanner } from '@/components/subscription-banner';
import { refusalMessage } from '@/lib/billing-messages';
import { useBilling, useOpenPortal, useStartCheckout } from '@/lib/use-billing';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

const PLAN_NAMES = { free: 'Free', pro: 'Pro', agency: 'Agency' } as const;

const periodDate = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function UsageCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-5">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </div>
  );
}

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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Billing</h1>
          <p className="text-sm text-muted-foreground">
            {billing.data
              ? `${PLAN_NAMES[billing.data.plan]} plan${
                  billing.data.subscription?.currentPeriodEnd
                    ? ` · ${billing.data.subscription.cancelAtPeriodEnd ? 'ends' : 'renews'} ${periodDate.format(
                        new Date(billing.data.subscription.currentPeriodEnd),
                      )} (UTC)`
                    : ''
                }`
              : 'What your organization can use, and how much of it you have used this month.'}
          </p>
        </div>
        {hasSubscription ? (
          <Button
            type="button"
            variant="outline"
            disabled={openPortal.isPending}
            onClick={onManage}
          >
            Manage in Stripe ↗
          </Button>
        ) : null}
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

          <div className="grid gap-5 md:grid-cols-3">
            <UsageCard label="Websites">
              <UsageBar
                label="Websites"
                labelHidden
                used={billing.data.usage.websites}
                limit={billing.data.limits.websites}
              />
              <span className="text-xs text-muted-foreground">
                {Math.max(billing.data.limits.websites - billing.data.usage.websites, 0)} more
                available on this plan
              </span>
            </UsageCard>
            <UsageCard label="AI explanations">
              <UsageBar
                label="AI explanations"
                labelHidden
                used={billing.data.usage.aiExplanationsThisMonth}
                limit={billing.data.limits.aiExplanationsPerMonth}
              />
              <span className="text-xs text-muted-foreground">
                {billing.data.limits.aiExplanationsPerMonth === 0
                  ? 'Not part of this plan'
                  : `${Math.max(
                      billing.data.limits.aiExplanationsPerMonth -
                        billing.data.usage.aiExplanationsThisMonth,
                      0,
                    )} left · resets on the 1st, 00:00 UTC`}
              </span>
            </UsageCard>
            <UsageCard label="Pages per scan">
              <span className="tnum text-3xl leading-none font-semibold tracking-[-0.02em]">
                {billing.data.limits.pagesPerScan}
              </span>
              <span className="text-xs text-muted-foreground">
                The ceiling for one crawl. A site set above it is clamped to this.
              </span>
            </UsageCard>
          </div>

          <PlanCards
            current={billing.data.plan}
            plans={billing.data.plans}
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
