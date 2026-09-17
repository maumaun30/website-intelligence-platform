import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditsRepository } from './audits.repository';

let prisma: PrismaClient;
let repo: AuditsRepository;

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
      name: 'S',
      url: 'https://s.test',
      domain: `s-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    },
  });
  const older = await prisma.scan.create({
    data: {
      websiteId: website.id,
      organizationId,
      status: 'completed',
      createdAt: new Date(Date.now() - 60_000),
    },
  });
  const scan = await prisma.scan.create({
    data: { websiteId: website.id, organizationId, status: 'completed' },
  });
  await prisma.scan.create({ data: { websiteId: website.id, organizationId, status: 'running' } });
  const pageA = await prisma.page.create({
    data: { scanId: scan.id, url: 'https://s.test/b', path: '/b', depth: 1 },
  });
  const pageB = await prisma.page.create({
    data: { scanId: scan.id, url: 'https://s.test/a', path: '/a', depth: 1 },
  });
  const audit = await prisma.audit.create({
    data: { scanId: scan.id, organizationId, status: 'completed' },
  });
  await prisma.issue.createMany({
    data: [
      {
        auditId: audit.id,
        pageId: pageA.id,
        ruleId: 'missing-h1',
        severity: 'warning',
        message: 'm',
      },
      {
        auditId: audit.id,
        pageId: pageB.id,
        ruleId: 'missing-h1',
        severity: 'warning',
        message: 'm',
      },
      {
        auditId: audit.id,
        pageId: pageA.id,
        ruleId: 'server-error',
        severity: 'critical',
        message: 'm',
      },
    ],
  });
  return { organizationId, websiteId: website.id, olderScanId: older.id, scanId: scan.id, audit };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new AuditsRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AuditsRepository', () => {
  it('scopes audits to the organization', async () => {
    const a = await seed();
    const b = await seed();

    expect(await repo.findByScan(a.scanId, b.organizationId)).toBeNull();
    expect((await repo.findByScan(a.scanId, a.organizationId))?.id).toBe(a.audit.id);
  });

  it('counts issues per rule', async () => {
    const { audit } = await seed();

    expect(await repo.ruleCounts(audit.id)).toEqual(
      expect.arrayContaining([
        { ruleId: 'missing-h1', severity: 'warning', count: 2 },
        { ruleId: 'server-error', severity: 'critical', count: 1 },
      ]),
    );
  });

  it('lists issues critical first, then by rule and path, with filters and page info', async () => {
    const { audit } = await seed();

    const all = await repo.listIssues(audit.id, {}, 10, 0);
    expect(all.total).toBe(3);
    expect(all.items.map((issue) => `${issue.ruleId}${issue.page.path}`)).toEqual([
      'server-error/b',
      'missing-h1/a',
      'missing-h1/b',
    ]);

    const filtered = await repo.listIssues(audit.id, { ruleId: 'missing-h1' }, 1, 1);
    expect(filtered.total).toBe(2);
    expect(filtered.items.map((issue) => issue.page.path)).toEqual(['/b']);
  });

  it('finds the newest completed scan of a website', async () => {
    const { websiteId, organizationId, scanId } = await seed();

    expect(await repo.latestCompletedScanId(websiteId, organizationId)).toBe(scanId);
  });

  it('requeues an audit, resetting its state', async () => {
    const { scanId, organizationId, audit } = await seed();
    await prisma.audit.update({ where: { id: audit.id }, data: { criticalCount: 4, error: 'x' } });

    const requeued = await repo.requeue(scanId, organizationId);

    expect(requeued).toMatchObject({
      id: audit.id,
      status: 'queued',
      criticalCount: 0,
      error: null,
    });
  });

  it('lists changes filtered by kind', async () => {
    const { audit } = await seed();
    await prisma.issueChange.createMany({
      data: [
        {
          auditId: audit.id,
          kind: 'new',
          ruleId: 'noindex',
          severity: 'notice',
          path: '/b',
          message: 'm',
        },
        {
          auditId: audit.id,
          kind: 'fixed',
          ruleId: 'missing-h1',
          severity: 'warning',
          path: '/a',
          message: 'm',
        },
        {
          auditId: audit.id,
          kind: 'new',
          ruleId: 'server-error',
          severity: 'critical',
          path: '/c',
          message: 'm',
        },
      ],
    });

    const newOnes = await repo.listChanges(audit.id, 'new', 10, 0);
    expect(newOnes.total).toBe(2);
    expect(newOnes.items.map((change) => change.ruleId)).toEqual(['server-error', 'noindex']);

    expect((await repo.listChanges(audit.id, undefined, 10, 0)).total).toBe(3);
  });
});
