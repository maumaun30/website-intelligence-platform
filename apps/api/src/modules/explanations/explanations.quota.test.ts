import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { utcMonthKey } from '@wintel/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BillingRepository } from '../billing/billing.repository';
import { BillingService } from '../billing/billing.service';
import { SubscriptionsRepository } from '../billing/subscriptions.repository';
import { ExplanationsRepository } from './explanations.repository';
import { ExplanationsService } from './explanations.service';

/**
 * The monthly AI cap against real Postgres: the explanation row is reused on regeneration, so the
 * cap must count requests, not rows. The queue and the audit lookup are doubles, so nothing here
 * reaches a model.
 */
let prisma: PrismaClient;

async function seed() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}`, plan: 'pro' },
  });
  const website = await prisma.website.create({
    data: {
      organizationId,
      createdById: userId,
      name: 'R',
      url: 'https://r.test',
      domain: `r-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    },
  });
  const scan = await prisma.scan.create({
    data: { websiteId: website.id, organizationId, status: 'completed' },
  });
  const audit = await prisma.audit.create({
    data: { scanId: scan.id, organizationId, status: 'completed' },
  });
  const page = await prisma.page.create({
    data: { scanId: scan.id, url: 'https://r.test/', path: '/', depth: 0 },
  });
  await prisma.issue.create({
    data: {
      auditId: audit.id,
      pageId: page.id,
      ruleId: 'missing-h1',
      severity: 'warning',
      message: 'm',
    },
  });
  return { userId, organizationId, audit: { id: audit.id, status: 'completed' as const } };
}

function wire(audit: { id: string; status: 'completed' }) {
  const prismaService = { client: prisma } as never;
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const service = new ExplanationsService(
    new ExplanationsRepository(prismaService),
    { findAuditOrThrow: vi.fn().mockResolvedValue(audit) } as never,
    { enqueue } as never,
    { AI_EXPLANATIONS_ENABLED: true },
    new BillingService(
      new BillingRepository(prismaService),
      new SubscriptionsRepository(prismaService),
    ),
  );
  return { service, enqueue };
}

async function complete(auditId: string) {
  await prisma.explanation.update({
    where: { auditId_ruleId: { auditId, ruleId: 'missing-h1' } },
    data: { status: 'completed', content: { summary: 's' } },
  });
}

async function usage(organizationId: string): Promise<number> {
  const row = await prisma.organizationUsage.findUnique({
    where: { organizationId_month: { organizationId, month: utcMonthKey(new Date()) } },
  });
  return row?.aiExplanations ?? 0;
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AI explanation quota (real Postgres)', () => {
  it('consumes one unit per regeneration of the same explanation', async () => {
    const { userId, organizationId, audit } = await seed();
    const { service, enqueue } = wire(audit);
    const owner = { organizationId, userId, role: 'owner' as const };

    await service.request('s1', owner, { ruleId: 'missing-h1', regenerate: false });
    await complete(audit.id);
    expect(await usage(organizationId)).toBe(1);

    await service.request('s1', owner, { ruleId: 'missing-h1', regenerate: true });
    await complete(audit.id);
    await service.request('s1', owner, { ruleId: 'missing-h1', regenerate: true });

    expect(await prisma.explanation.count({ where: { auditId: audit.id } })).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(await usage(organizationId)).toBe(3);
  });

  it('does not consume quota when an existing explanation is returned as is', async () => {
    const { userId, organizationId, audit } = await seed();
    const { service, enqueue } = wire(audit);
    const member = { organizationId, userId, role: 'member' as const };

    await service.request('s1', member, { ruleId: 'missing-h1', regenerate: false });
    await service.request('s1', member, { ruleId: 'missing-h1', regenerate: false });
    await complete(audit.id);
    await service.request('s1', member, { ruleId: 'missing-h1', regenerate: false });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await usage(organizationId)).toBe(1);
  });

  it('refuses a regeneration once the month is used up', async () => {
    const { userId, organizationId, audit } = await seed();
    const { service, enqueue } = wire(audit);
    const owner = { organizationId, userId, role: 'owner' as const };
    await prisma.organizationUsage.create({
      data: { organizationId, month: utcMonthKey(new Date()), aiExplanations: 99 },
    });

    await service.request('s1', owner, { ruleId: 'missing-h1', regenerate: false });
    await complete(audit.id);

    await expect(
      service.request('s1', owner, { ruleId: 'missing-h1', regenerate: true }),
    ).rejects.toMatchObject({
      response: { details: { code: 'PLAN_AI_LIMIT', limit: 100, current: 100 } },
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await usage(organizationId)).toBe(100);
  });
});
