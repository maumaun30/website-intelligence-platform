import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BillingRepository } from './billing.repository';

let prisma: PrismaClient;
let repo: BillingRepository;

async function seedOrganization() {
  const organizationId = randomUUID();
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}`, plan: 'pro' },
  });
  return organizationId;
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new BillingRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('BillingRepository AI usage counter', () => {
  it('reads 0 for a month with no row', async () => {
    const organizationId = await seedOrganization();

    expect(await repo.aiUsage(organizationId, '2026-09')).toBe(0);
  });

  it('increments while below the limit and refuses at it', async () => {
    const organizationId = await seedOrganization();

    expect(await repo.incrementAiUsageBelow(organizationId, '2026-09', 2)).toBe(true);
    expect(await repo.incrementAiUsageBelow(organizationId, '2026-09', 2)).toBe(true);
    expect(await repo.incrementAiUsageBelow(organizationId, '2026-09', 2)).toBe(false);

    expect(await repo.aiUsage(organizationId, '2026-09')).toBe(2);
    expect(await repo.aiUsage(organizationId, '2026-10')).toBe(0);
  });

  it('never lets concurrent requests take more units than the limit', async () => {
    const organizationId = await seedOrganization();

    const results = await Promise.all(
      Array.from({ length: 12 }, () => repo.incrementAiUsageBelow(organizationId, '2026-09', 5)),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await repo.aiUsage(organizationId, '2026-09')).toBe(5);
  });
});
