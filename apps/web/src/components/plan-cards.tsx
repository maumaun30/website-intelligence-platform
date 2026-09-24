'use client';

import { Button } from '@wintel/ui';
import {
  ORGANIZATION_PLANS,
  PURCHASABLE_PLANS,
  type OrganizationPlan,
  type PlanLimits,
  type PurchasablePlan,
} from '@wintel/types';

import { UsageBar } from './usage-bar';

const PLAN_NAMES: Record<OrganizationPlan, string> = {
  free: 'Free',
  pro: 'Pro',
  agency: 'Agency',
};

function describe(limits: PlanLimits): string[] {
  return [
    `${limits.websites} website${limits.websites === 1 ? '' : 's'}`,
    `${limits.pagesPerScan} pages per scan`,
    limits.scanFrequencies.includes('daily') ? 'Daily and weekly scans' : 'Manual scans only',
    limits.aiExplanationsPerMonth === 0
      ? 'No AI explanations'
      : `${limits.aiExplanationsPerMonth} AI explanations per month`,
  ];
}

function isPurchasable(plan: OrganizationPlan): plan is PurchasablePlan {
  return (PURCHASABLE_PLANS as readonly OrganizationPlan[]).includes(plan);
}

/**
 * The plan catalog with the current plan marked. Subscribing sends the owner to Stripe Checkout,
 * so a card only offers that for a purchasable plan that is not already current. Once a
 * subscription exists, the Portal is the only way to change or cancel it, so no card offers a
 * button at all — the page shows one "Manage billing" button instead.
 */
export function PlanCards({
  current,
  plans,
  usage,
  hasSubscription,
  onSubscribe,
  pending,
}: {
  current: OrganizationPlan;
  plans: Record<OrganizationPlan, PlanLimits>;
  usage: { websites: number; aiExplanationsThisMonth: number };
  hasSubscription: boolean;
  onSubscribe: (plan: PurchasablePlan) => void;
  pending: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {ORGANIZATION_PLANS.map((plan) => {
        const limits = plans[plan];
        const isCurrent = plan === current;

        return (
          <section
            key={plan}
            className={
              isCurrent
                ? 'flex flex-col gap-4 rounded-lg border border-primary p-4'
                : 'flex flex-col gap-4 rounded-lg border border-border p-4'
            }
          >
            <header className="flex items-center justify-between">
              <h3 className="font-semibold tracking-tight">{PLAN_NAMES[plan]}</h3>
              {isCurrent ? <span className="text-xs text-primary">Current plan</span> : null}
            </header>

            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {describe(limits).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {isCurrent ? (
              <div className="flex flex-col gap-2">
                <UsageBar label="Websites" used={usage.websites} limit={limits.websites} />
                <UsageBar
                  label="AI explanations this month"
                  used={usage.aiExplanationsThisMonth}
                  limit={limits.aiExplanationsPerMonth}
                />
              </div>
            ) : !hasSubscription && isPurchasable(plan) ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onSubscribe(plan)}
              >
                Subscribe to {PLAN_NAMES[plan]}
              </Button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
