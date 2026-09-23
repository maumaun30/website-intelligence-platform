import { Injectable } from '@nestjs/common';
import type { OrganizationPlan, SubscriptionStatus } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface SubscriptionRow {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  plan: OrganizationPlan;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: Date | null;
}

/** The billing record behind an organization's plan. One row per organization, or none. */
@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(organizationId: string): Promise<SubscriptionRow | null> {
    return this.prisma.client.subscription.findUnique({ where: { organizationId } });
  }

  /** Records the Stripe customer before checkout; the plan is provisional until a webhook lands. */
  async upsertCustomer(
    organizationId: string,
    stripeCustomerId: string,
    plan: OrganizationPlan,
  ): Promise<void> {
    await this.prisma.client.subscription.upsert({
      where: { organizationId },
      create: { organizationId, stripeCustomerId, plan, status: 'incomplete' },
      update: { stripeCustomerId },
    });
  }
}
