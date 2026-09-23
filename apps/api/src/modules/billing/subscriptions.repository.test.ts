import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SubscriptionsRepository } from './subscriptions.repository';

let prisma: PrismaClient;
let repo: SubscriptionsRepository;
let userId: string;

async function seedOrganization(plan: 'free' | 'pro' | 'agency' = 'pro') {
  const organizationId = randomUUID();
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}`, plan },
  });
  return organizationId;
}

async function seedSubscription(organizationId: string, stripeCustomerId: string) {
  await prisma.subscription.create({
    data: {
      organizationId,
      stripeCustomerId,
      stripeSubscriptionId: `sub_${stripeCustomerId}`,
      status: 'active',
      plan: 'pro',
    },
  });
}

async function seedWebsite(organizationId: string, scanFrequency: 'manual' | 'daily' | 'weekly') {
  return prisma.website.create({
    data: {
      organizationId,
      createdById: userId,
      name: 'W',
      url: `https://sub-repo-${randomUUID()}.test`,
      domain: `sub-repo-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      scanFrequency,
      nextScanAt: scanFrequency === 'manual' ? null : new Date('2026-09-18T00:00:00.000Z'),
    },
  });
}

beforeAll(async () => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new SubscriptionsRepository({ client: prisma } as never);
  userId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('SubscriptionsRepository.applyStripeState', () => {
  it('drops a pro organization to free and resets a daily website to manual, exactly as an in-app downgrade would', async () => {
    const organizationId = await seedOrganization('pro');
    const stripeCustomerId = `cus_${randomUUID()}`;
    await seedSubscription(organizationId, stripeCustomerId);
    const website = await seedWebsite(organizationId, 'daily');
    const eventCreated = new Date('2026-09-20T00:00:00.000Z');

    const applied = await repo.applyStripeState({
      eventId: `evt_${randomUUID()}`,
      eventType: 'customer.subscription.deleted',
      eventCreated,
      organizationId,
      stripeCustomerId,
      stripeSubscriptionId: null,
      status: 'canceled',
      plan: 'free',
      downgradedWebsiteIds: [website.id],
    });

    expect(applied).toBe(true);

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    expect(organization.plan).toBe('free');

    const rereadWebsite = await prisma.website.findUniqueOrThrow({ where: { id: website.id } });
    expect(rereadWebsite.scanFrequency).toBe('manual');
    expect(rereadWebsite.nextScanAt).toBeNull();

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(subscription.status).toBe('canceled');
    expect(subscription.stripeSubscriptionId).toBeNull();
    expect(subscription.lastEventAt).toEqual(eventCreated);
  });

  it('returns false and writes nothing for a duplicate eventId', async () => {
    const organizationId = await seedOrganization('pro');
    const stripeCustomerId = `cus_${randomUUID()}`;
    await seedSubscription(organizationId, stripeCustomerId);
    const eventId = `evt_${randomUUID()}`;

    const first = await repo.applyStripeState({
      eventId,
      eventType: 'customer.subscription.deleted',
      eventCreated: new Date('2026-09-20T00:00:00.000Z'),
      organizationId,
      stripeCustomerId,
      stripeSubscriptionId: null,
      status: 'canceled',
      plan: 'free',
      downgradedWebsiteIds: [],
    });
    expect(first).toBe(true);

    // Same eventId again, this time asking to flip the plan back to pro — it must not take.
    const second = await repo.applyStripeState({
      eventId,
      eventType: 'customer.subscription.deleted',
      eventCreated: new Date('2026-09-21T00:00:00.000Z'),
      organizationId,
      stripeCustomerId,
      stripeSubscriptionId: null,
      status: 'active',
      plan: 'pro',
      downgradedWebsiteIds: [],
    });
    expect(second).toBe(false);

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    expect(organization.plan).toBe('free');

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(subscription.status).toBe('canceled');
    expect(subscription.lastEventAt).toEqual(new Date('2026-09-20T00:00:00.000Z'));
  });

  it('leaves a website belonging to a different organization untouched', async () => {
    const organizationId = await seedOrganization('pro');
    const stripeCustomerId = `cus_${randomUUID()}`;
    await seedSubscription(organizationId, stripeCustomerId);

    const otherOrganizationId = await seedOrganization('pro');
    const foreignWebsite = await seedWebsite(otherOrganizationId, 'daily');

    await repo.applyStripeState({
      eventId: `evt_${randomUUID()}`,
      eventType: 'customer.subscription.deleted',
      eventCreated: new Date('2026-09-20T00:00:00.000Z'),
      organizationId,
      stripeCustomerId,
      stripeSubscriptionId: null,
      status: 'canceled',
      plan: 'free',
      downgradedWebsiteIds: [foreignWebsite.id],
    });

    const reread = await prisma.website.findUniqueOrThrow({ where: { id: foreignWebsite.id } });
    expect(reread.scanFrequency).toBe('daily');
    expect(reread.nextScanAt).toEqual(foreignWebsite.nextScanAt);
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: otherOrganizationId } })).plan,
    ).toBe('pro');
  });

  // Ruling B: an event whose object carries no period fields (a bare checkout session) must not
  // null out a period end a previous event already recorded.
  it('leaves currentPeriodEnd intact when a later event carries none', async () => {
    const organizationId = await seedOrganization('pro');
    const stripeCustomerId = `cus_${randomUUID()}`;
    await seedSubscription(organizationId, stripeCustomerId);
    const periodEnd = new Date('2026-10-20T00:00:00.000Z');

    await repo.applyStripeState({
      eventId: `evt_${randomUUID()}`,
      eventType: 'customer.subscription.created',
      eventCreated: new Date('2026-09-20T00:00:00.000Z'),
      organizationId,
      stripeCustomerId,
      stripeSubscriptionId: `sub_${stripeCustomerId}`,
      status: 'active',
      plan: 'pro',
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      downgradedWebsiteIds: [],
    });

    // A checkout.session.completed arriving after it: no currentPeriodEnd/cancelAtPeriodEnd keys.
    await repo.applyStripeState({
      eventId: `evt_${randomUUID()}`,
      eventType: 'checkout.session.completed',
      eventCreated: new Date('2026-09-21T00:00:00.000Z'),
      organizationId,
      stripeCustomerId,
      stripeSubscriptionId: `sub_${stripeCustomerId}`,
      status: 'incomplete',
      downgradedWebsiteIds: [],
    });

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(subscription.currentPeriodEnd).toEqual(periodEnd);
    expect(subscription.status).toBe('incomplete');
  });
});
