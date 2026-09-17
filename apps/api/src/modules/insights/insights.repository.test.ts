import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InsightsRepository } from './insights.repository';

let prisma: PrismaClient;
let repo: InsightsRepository;

async function seedOrg() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` },
  });
  return { userId, organizationId };
}

async function seedWebsite(org: { userId: string; organizationId: string }, name: string) {
  return prisma.website.create({
    data: {
      organizationId: org.organizationId,
      createdById: org.userId,
      name,
      url: `https://${name}.test`,
      domain: `${name}-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      verificationStatus: 'verified',
    },
  });
}

async function auditedScan(
  website: { id: string; organizationId: string },
  minutesAgo: number,
  score: number | null,
  auditStatus: 'completed' | 'running' = 'completed',
) {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  const scan = await prisma.scan.create({
    data: {
      websiteId: website.id,
      organizationId: website.organizationId,
      status: 'completed',
      createdAt: at,
    },
  });
  await prisma.audit.create({
    data: {
      scanId: scan.id,
      organizationId: website.organizationId,
      status: auditStatus,
      score,
      scoreDelta: score === null ? null : 5,
      criticalCount: 2,
      finishedAt: auditStatus === 'completed' ? at : null,
    },
  });
  return scan;
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new InsightsRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('InsightsRepository', () => {
  it('returns completed audits oldest first, limited to the newest N, scoped to the org', async () => {
    const org = await seedOrg();
    const other = await seedOrg();
    const website = await seedWebsite(org, 'trend');
    await auditedScan(website, 30, 50);
    await auditedScan(website, 20, 60);
    await auditedScan(website, 10, 70);
    await auditedScan(website, 5, null, 'running');

    const points = await repo.trend(website.id, org.organizationId, 2);
    expect(points.map((point) => point.score)).toEqual([60, 70]);
    expect(await repo.trend(website.id, other.organizationId, 10)).toEqual([]);
  });

  it('builds one overview row per website with its latest completed audit and latest scan', async () => {
    const org = await seedOrg();
    const audited = await seedWebsite(org, 'audited');
    const fresh = await seedWebsite(org, 'fresh');
    await auditedScan(audited, 20, 40);
    await auditedScan(audited, 10, 80);
    await prisma.scan.create({
      data: { websiteId: audited.id, organizationId: org.organizationId, status: 'running' },
    });

    const rows = await repo.overview(org.organizationId);

    expect(rows).toHaveLength(2);
    const auditedRow = rows.find((row) => row.websiteId === audited.id)!;
    expect(auditedRow).toMatchObject({ score: 80, scoreDelta: 5, criticalCount: 2 });
    expect(auditedRow.lastScan?.status).toBe('running');
    const freshRow = rows.find((row) => row.websiteId === fresh.id)!;
    expect(freshRow).toMatchObject({ score: null, auditedAt: null, lastScan: null });
  });
});
