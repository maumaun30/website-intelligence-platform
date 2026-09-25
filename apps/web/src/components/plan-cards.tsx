'use client';

import { Button } from '@wintel/ui';
import {
  ORGANIZATION_PLANS,
  PURCHASABLE_PLANS,
  type OrganizationPlan,
  type PlanLimits,
  type PurchasablePlan,
} from '@wintel/types';

const PLAN_NAMES: Record<OrganizationPlan, string> = {
  free: 'Free',
  pro: 'Pro',
  agency: 'Agency',
};

const PLAN_BLURBS: Record<OrganizationPlan, string> = {
  free: 'One site, scanned when you ask. Good for trying it out.',
  pro: 'For in-house teams watching a few sites closely.',
  agency: 'For agencies reporting on many client sites.',
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

const CHECK = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
    className="mt-0.5 flex-none text-primary"
  >
    <path d="M3.5 8.3l3 3 6-6.5" />
  </svg>
);

/**
 * The plan catalog with the current plan marked. Subscribing sends the owner to Stripe Checkout,
 * so a card only offers that for a purchasable plan that is not already current. Once a
 * subscription exists, the Portal is the only way to change or cancel it, so no card offers a
 * button at all — the page shows one "Manage in Stripe" button instead.
 */
export function PlanCards({
  current,
  plans,
  hasSubscription,
  onSubscribe,
  pending,
}: {
  current: OrganizationPlan;
  plans: Record<OrganizationPlan, PlanLimits>;
  hasSubscription: boolean;
  onSubscribe: (plan: PurchasablePlan) => void;
  pending: boolean;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {ORGANIZATION_PLANS.map((plan) => {
        const limits = plans[plan];
        const isCurrent = plan === current;

        return (
          <section
            key={plan}
            className={`flex flex-col gap-4 rounded-lg bg-card p-6 ${
              isCurrent ? 'border-2 border-primary' : 'border border-border'
            }`}
          >
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold tracking-tight">{PLAN_NAMES[plan]}</h3>
              {isCurrent ? (
                <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-primary-soft-foreground">
                  Current plan
                </span>
              ) : null}
            </header>

            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {PLAN_BLURBS[plan]}
            </p>

            <ul className="flex flex-col gap-2">
              {describe(limits).map((line) => (
                <li key={line} className="flex gap-2.5 text-sm">
                  {CHECK}
                  {line}
                </li>
              ))}
            </ul>

            {!isCurrent && !hasSubscription && isPurchasable(plan) ? (
              <Button
                type="button"
                className="mt-auto h-10 w-full"
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
