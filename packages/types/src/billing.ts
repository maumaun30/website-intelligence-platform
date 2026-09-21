import { z } from 'zod';

import { SCAN_FREQUENCIES, type ScanFrequency } from './website';

export const ORGANIZATION_PLANS = ['free', 'pro', 'agency'] as const;
export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];

export interface PlanLimits {
  websites: number;
  pagesPerScan: number;
  scanFrequencies: readonly ScanFrequency[];
  aiExplanationsPerMonth: number;
}

/**
 * What each plan allows. Enforced by the API at the create/start boundary and re-checked by the
 * worker, so both read this one table. Changing a number here changes both.
 */
export const PLAN_LIMITS: Record<OrganizationPlan, PlanLimits> = {
  free: {
    websites: 1,
    pagesPerScan: 100,
    scanFrequencies: ['manual'],
    aiExplanationsPerMonth: 0,
  },
  pro: {
    websites: 10,
    pagesPerScan: 1000,
    scanFrequencies: ['manual', 'daily', 'weekly'],
    aiExplanationsPerMonth: 100,
  },
  agency: {
    websites: 50,
    pagesPerScan: 10000,
    scanFrequencies: ['manual', 'daily', 'weekly'],
    aiExplanationsPerMonth: 500,
  },
};

/** Countable refusals carry the numbers the UI shows; the other two are about the plan itself. */
export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; code: 'PLAN_WEBSITE_LIMIT' | 'PLAN_AI_LIMIT'; limit: number; current: number }
  | { allowed: false; code: 'PLAN_SCAN_FREQUENCY' | 'PLAN_AI_LOCKED' };

export type QuotaQuery =
  | { plan: OrganizationPlan; kind: 'websites'; current: number }
  | { plan: OrganizationPlan; kind: 'aiExplanations'; current: number }
  | { plan: OrganizationPlan; kind: 'scanFrequency'; scanFrequency: ScanFrequency };

/**
 * Whether one more of something is allowed on a plan. Pure: the caller supplies the counts and
 * performs whatever the decision implies.
 */
export function evaluateQuota(query: QuotaQuery): QuotaDecision {
  const limits = PLAN_LIMITS[query.plan];

  if (query.kind === 'scanFrequency') {
    return limits.scanFrequencies.includes(query.scanFrequency)
      ? { allowed: true }
      : { allowed: false, code: 'PLAN_SCAN_FREQUENCY' };
  }

  if (query.kind === 'websites') {
    return query.current < limits.websites
      ? { allowed: true }
      : {
          allowed: false,
          code: 'PLAN_WEBSITE_LIMIT',
          limit: limits.websites,
          current: query.current,
        };
  }

  // A plan that includes no AI at all is locked, not exhausted: the two need different wording.
  if (limits.aiExplanationsPerMonth === 0) {
    return { allowed: false, code: 'PLAN_AI_LOCKED' };
  }
  return query.current < limits.aiExplanationsPerMonth
    ? { allowed: true }
    : {
        allowed: false,
        code: 'PLAN_AI_LIMIT',
        limit: limits.aiExplanationsPerMonth,
        current: query.current,
      };
}

/**
 * Pages one scan may crawl. A downgrade must not break an existing website, so the stored
 * `maxPages` survives and only the crawl is bounded.
 */
export function effectivePageCap(plan: OrganizationPlan, websiteMaxPages: number): number {
  return Math.min(websiteMaxPages, PLAN_LIMITS[plan].pagesPerScan);
}

/**
 * Which websites a plan change forces back to manual scanning. Used by the web app to warn before
 * the switch and by the API to perform it.
 */
export function evaluatePlanChange(input: {
  plan: OrganizationPlan;
  websites: readonly { id: string; scanFrequency: ScanFrequency }[];
}): { frequencyDowngrades: string[] } {
  const allowed = PLAN_LIMITS[input.plan].scanFrequencies;
  return {
    frequencyDowngrades: input.websites
      .filter((website) => !allowed.includes(website.scanFrequency))
      .map((website) => website.id),
  };
}

/** Start of the AI quota window: midnight UTC on the first of the current month. */
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export const planLimitsSchema = z.object({
  websites: z.number().int(),
  pagesPerScan: z.number().int(),
  scanFrequencies: z.array(z.enum(SCAN_FREQUENCIES)).readonly(),
  aiExplanationsPerMonth: z.number().int(),
});

/** What `GET /billing` returns: the current plan, its limits, usage, and the full catalog. */
export const billingStateSchema = z.object({
  plan: z.enum(ORGANIZATION_PLANS),
  limits: planLimitsSchema,
  usage: z.object({
    websites: z.number().int(),
    aiExplanationsThisMonth: z.number().int(),
  }),
  plans: z.record(z.enum(ORGANIZATION_PLANS), planLimitsSchema),
});

export const planChangeResultSchema = billingStateSchema.extend({
  downgradedWebsites: z.array(z.string()),
});

export const changePlanInputSchema = z.object({ plan: z.enum(ORGANIZATION_PLANS) });

export type BillingState = z.infer<typeof billingStateSchema>;
export type PlanChangeResult = z.infer<typeof planChangeResultSchema>;
export type ChangePlanInput = z.infer<typeof changePlanInputSchema>;
