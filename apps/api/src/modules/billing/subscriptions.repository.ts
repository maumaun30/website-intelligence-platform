import { Injectable } from '@nestjs/common';
import { Prisma } from '@wintel/database';
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

  findByCustomer(stripeCustomerId: string): Promise<SubscriptionRow | null> {
    return this.prisma.client.subscription.findUnique({ where: { stripeCustomerId } });
  }

  /**
   * Applies one Stripe event: records it, updates the billing row, moves the plan, and resets the
   * schedules a lower plan forbids — all or nothing. The `StripeEvent` insert is the idempotency
   * guard, so a redelivered event writes nothing and returns false.
   *
   * `stripeSubscriptionId`, `status`, `currentPeriodEnd`, `cancelAtPeriodEnd` and `eventCreated`
   * (the `lastEventAt` watermark) are only written when the caller actually supplies them: an
   * event whose object carries neither (a bare checkout session, or either invoice event, say)
   * must leave the stored values exactly as they are, not null or overwrite them. In particular,
   * only the caller for a `customer.subscription.*` event passes `eventCreated` — see Finding 1 in
   * stripe-events.service.ts — and invoice events never pass `stripeSubscriptionId` — see Finding 4.
   */
  async applyStripeState(input: {
    eventId: string;
    eventType: string;
    eventCreated?: Date;
    organizationId: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string | null;
    status?: SubscriptionStatus;
    plan?: OrganizationPlan;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    downgradedWebsiteIds: string[];
  }): Promise<boolean> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.stripeEvent.create({ data: { id: input.eventId, type: input.eventType } });

        await tx.subscription.update({
          where: { organizationId: input.organizationId },
          data: {
            // Finding 4: omitted (not merely null) means "the event carried no subscription id" —
            // leave the stored value untouched, same omission pattern as the fields below.
            // `null` is still a deliberate write (customer.subscription.deleted clears it).
            ...(input.stripeSubscriptionId === undefined
              ? {}
              : { stripeSubscriptionId: input.stripeSubscriptionId }),
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.plan ? { plan: input.plan } : {}),
            ...(input.currentPeriodEnd === undefined
              ? {}
              : { currentPeriodEnd: input.currentPeriodEnd }),
            ...(input.cancelAtPeriodEnd === undefined
              ? {}
              : { cancelAtPeriodEnd: input.cancelAtPeriodEnd }),
            ...(input.eventCreated === undefined ? {} : { lastEventAt: input.eventCreated }),
          },
        });

        if (input.plan) {
          await tx.organization.update({
            where: { id: input.organizationId },
            data: { plan: input.plan },
          });
        }

        if (input.downgradedWebsiteIds.length > 0) {
          await tx.website.updateMany({
            where: {
              id: { in: input.downgradedWebsiteIds },
              organizationId: input.organizationId,
            },
            data: { scanFrequency: 'manual', nextScanAt: null },
          });
        }
      });
      return true;
    } catch (error) {
      // Only a P2002 on StripeEvent's own primary key ("id") means "already applied" — a
      // redelivery colliding with the idempotency guard. Confirmed empirically (see task-5
      // report): Prisma reports that as `{ modelName: 'StripeEvent', target: ['id'] }`. Any other
      // P2002 (e.g. a genuine collision on Subscription.stripeSubscriptionId, which is also
      // @unique) is a real constraint violation and must propagate as a 500 so Stripe retries —
      // swallowing it here would silently drop the event forever.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        error.meta?.['modelName'] === 'StripeEvent' &&
        Array.isArray(error.meta['target']) &&
        (error.meta['target'] as unknown[]).includes('id')
      ) {
        return false; // already applied
      }
      throw error;
    }
  }
}
