'use client';

import { Button } from '@wintel/ui';
import {
  ORGANIZATION_PLANS,
  type OrganizationPlan,
  type PlanLimits,
  type ScanFrequency,
  evaluatePlanChange,
} from '@wintel/types';
import { useEffect, useId, useRef, useState } from 'react';

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

/**
 * The confirm step every switch goes through. A downgrade resets schedules and the previous
 * frequencies are not kept, so the step names each website that will lose its schedule.
 */
function ConfirmSwitch({
  plan,
  losing,
  pending,
  onConfirm,
  onCancel,
}: {
  plan: OrganizationPlan;
  losing: WebsiteSummary[];
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const region = useRef<HTMLDivElement>(null);

  useEffect(() => {
    region.current?.focus();
  }, []);

  return (
    <div
      ref={region}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onCancel();
        }
      }}
      className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p id={titleId} className="text-sm font-medium">
        Switch to {PLAN_NAMES[plan]}?
      </p>
      <div id={descriptionId} className="flex flex-col gap-1 text-xs text-muted-foreground">
        {losing.length > 0 ? (
          <>
            <p>These websites go back to manual scanning, and their schedules are not kept:</p>
            <ul className="list-disc pl-4">
              {losing.map((site) => (
                <li key={site.id}>{site.name}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>No scheduled scans change.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onConfirm}>
          Confirm switch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The plan catalog with the current plan marked; switching asks to confirm what it resets. */
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
  const [confirming, setConfirming] = useState<OrganizationPlan | null>(null);

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
                {confirming === plan ? (
                  <ConfirmSwitch
                    plan={plan}
                    losing={losing}
                    pending={pending}
                    onConfirm={() => {
                      setConfirming(null);
                      onSelect(plan);
                    }}
                    onCancel={() => setConfirming(null)}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setConfirming(plan)}
                  >
                    Switch to {PLAN_NAMES[plan]}
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
