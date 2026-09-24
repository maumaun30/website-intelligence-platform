import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  type BillingState,
  PLAN_LIMITS,
  type OrganizationPlan,
  type QuotaDecision,
  type ScanFrequency,
  evaluateQuota,
  utcMonthKey,
} from '@wintel/types';

import { BillingRepository } from './billing.repository';
import { SubscriptionsRepository } from './subscriptions.repository';

const REFUSAL_MESSAGES = {
  PLAN_WEBSITE_LIMIT: 'Your plan does not allow any more websites',
  PLAN_SCAN_FREQUENCY: 'Scheduled scans are not part of your plan',
  PLAN_AI_LIMIT: 'You have used every AI explanation in your plan this month',
  PLAN_AI_LOCKED: 'AI explanations are not part of your plan',
} as const;

/**
 * Plan state and the quota gate other features call. The rules themselves live in `@wintel/types`
 * so the worker enforces exactly the same ones.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly subscriptions: SubscriptionsRepository,
  ) {}

  planFor(organizationId: string): Promise<OrganizationPlan> {
    return this.repo.plan(organizationId);
  }

  async state(organizationId: string, now: Date = new Date()): Promise<BillingState> {
    const [plan, websites, aiExplanationsThisMonth, subscription] = await Promise.all([
      this.repo.plan(organizationId),
      this.repo.countWebsites(organizationId),
      this.repo.aiUsage(organizationId, utcMonthKey(now)),
      this.subscriptions.find(organizationId),
    ]);

    return {
      plan,
      limits: PLAN_LIMITS[plan],
      usage: { websites, aiExplanationsThisMonth },
      plans: PLAN_LIMITS,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
    };
  }

  async assertScanFrequency(organizationId: string, scanFrequency: ScanFrequency): Promise<void> {
    const plan = await this.repo.plan(organizationId);
    this.enforce(evaluateQuota({ plan, kind: 'scanFrequency', scanFrequency }));
  }

  /**
   * Takes one AI explanation from this month's allowance, or refuses. Call it only when a
   * generation will actually be queued: every call that returns is one Claude call's worth of
   * spend, regenerations included.
   */
  async consumeAiQuota(organizationId: string, now: Date = new Date()): Promise<void> {
    const plan = await this.repo.plan(organizationId);
    const limit = PLAN_LIMITS[plan].aiExplanationsPerMonth;
    if (limit === 0) {
      this.refuse({ allowed: false, code: 'PLAN_AI_LOCKED' });
    }

    const month = utcMonthKey(now);
    if (await this.repo.incrementAiUsageBelow(organizationId, month, limit)) {
      return;
    }
    const current = await this.repo.aiUsage(organizationId, month);
    this.refuse({ allowed: false, code: 'PLAN_AI_LIMIT', limit, current });
  }

  private enforce(decision: QuotaDecision): void {
    if (!decision.allowed) {
      this.refuse(decision);
    }
  }

  private refuse(decision: Exclude<QuotaDecision, { allowed: true }>): never {
    const details =
      'limit' in decision
        ? { code: decision.code, limit: decision.limit, current: decision.current }
        : { code: decision.code };

    throw new ForbiddenException({ message: REFUSAL_MESSAGES[decision.code], details });
  }
}
