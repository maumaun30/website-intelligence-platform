'use client';

import {
  ORGANIZATION_PLANS,
  type OrganizationPlan,
  type PlanLimits,
  type ScanFrequency,
  evaluatePlanChange,
} from '@wintel/types';

import { UsageBar } from './usage-bar';

interface WebsiteSummary {
  id: string;
  name: string;
  scanFrequency: ScanFrequency;
}

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

/** The plan catalog with the current plan marked, plus what a downgrade would reset. */
export function PlanCards({
  current,
  plans,
  usage,
  websites = [],
  onSelect,
  pending,
}: {
  current: OrganizationPlan;
  plans: Record<OrganizationPlan, PlanLimits>;
  usage: { websites: number; aiExplanationsThisMonth: number };
  websites?: WebsiteSummary[];
  onSelect: (plan: OrganizationPlan) => void;
  pending: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {ORGANIZATION_PLANS.map((plan) => {
        const limits = plans[plan];
        const isCurrent = plan === current;
        const { frequencyDowngrades } = evaluatePlanChange({ plan, websites });
        const losing = websites.filter((website) => frequencyDowngrades.includes(website.id));

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
            ) : (
              <div className="flex flex-col gap-2">
                {losing.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Switching stops scheduled scans on {losing.map((site) => site.name).join(', ')}.
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onSelect(plan)}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Switch to {PLAN_NAMES[plan]}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
