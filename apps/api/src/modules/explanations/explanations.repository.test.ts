import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExplanationsRepository } from './explanations.repository';

let prisma: PrismaClient;
let repo: ExplanationsRepository;

async function seed() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` },
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
  return { userId, organizationId, auditId: audit.id };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new ExplanationsRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ExplanationsRepository', () => {
  it('queues a new explanation and resets an existing one', async () => {
    const { userId, organizationId, auditId } = await seed();

    const first = await repo.queue({
      auditId,
      ruleId: 'missing-h1',
      organizationId,
      requestedById: userId,
    });
    await prisma.explanation.update({
      where: { id: first.id },
      data: { status: 'completed', content: { summary: 's' }, error: 'x', model: 'm' },
    });
    const again = await repo.queue({
      auditId,
      ruleId: 'missing-h1',
      organizationId,
      requestedById: userId,
    });

    expect(again).toMatchObject({ id: first.id, status: 'queued', error: null, model: null });
    expect(again.content).toBeNull();
  });

  it('counts issues per rule and requests per organization since a time', async () => {
    const { userId, organizationId, auditId } = await seed();
    await repo.queue({ auditId, ruleId: 'missing-h1', organizationId, requestedById: userId });

    expect(await repo.countIssues(auditId, 'missing-h1')).toBe(1);
    expect(await repo.countIssues(auditId, 'noindex')).toBe(0);
    expect(await repo.countRequestedSince(organizationId, new Date(Date.now() - 60_000))).toBe(1);
    expect(await repo.countRequestedSince(organizationId, new Date(Date.now() + 60_000))).toBe(0);
  });
});
