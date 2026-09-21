'use client';

import type { OrganizationPlan } from '@wintel/types';

import { PlanCards } from '@/components/plan-cards';
import { useBilling, useChangePlan } from '@/lib/use-billing';
import { useWebsites } from '@/lib/use-websites';

export default function BillingPage() {
  const billing = useBilling();
  const websites = useWebsites();
  const changePlan = useChangePlan();

  const onSelect = (plan: OrganizationPlan) => {
    changePlan.mutate(plan);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="text-sm text-muted-foreground">
          What your organization can use, and how much of it you have used this month.
        </p>
      </header>

      {billing.isPending ? (
        <p className="text-sm text-muted-foreground">Loading your plan…</p>
      ) : billing.isError ? (
        <p className="text-sm text-destructive">Could not load your plan.</p>
      ) : (
        <PlanCards
          current={billing.data.plan}
          plans={billing.data.plans}
          usage={billing.data.usage}
          websites={websites.data ?? []}
          onSelect={onSelect}
          pending={changePlan.isPending}
        />
      )}

      {changePlan.isError ? (
        <p className="text-sm text-destructive">
          Could not change the plan. Only an owner can do this.
        </p>
      ) : null}

      {changePlan.data && changePlan.data.downgradedWebsites.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {changePlan.data.downgradedWebsites.length} website(s) went back to manual scanning.
        </p>
      ) : null}
    </div>
  );
}
