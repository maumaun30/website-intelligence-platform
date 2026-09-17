import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ScansRepository } from './scans.repository';

let prisma: PrismaClient;
let repo: ScansRepository;

async function seedWebsite(): Promise<{ organizationId: string; websiteId: string }> {
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
      name: 'Site',
      url: 'https://site.test',
      domain: `site-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      verificationStatus: 'verified',
    },
  });
  return { organizationId, websiteId: website.id };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new ScansRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ScansRepository', () => {
  it('scopes scan reads to the owning organization', async () => {
    const a = await seedWebsite();
    const b = await seedWebsite();
    const scan = await repo.createQueued(a);

    expect(await repo.findInOrg(scan.id, b.organizationId)).toBeNull();
    expect(await repo.findInOrg(scan.id, a.organizationId)).not.toBeNull();
    expect(await repo.listForWebsite(a.websiteId, b.organizationId)).toHaveLength(0);
    expect(await repo.listForWebsite(a.websiteId, a.organizationId)).toHaveLength(1);
  });

  it('finds only queued or running scans as active', async () => {
    const a = await seedWebsite();
    const done = await repo.createQueued(a);
    await prisma.scan.update({ where: { id: done.id }, data: { status: 'completed' } });

    expect(await repo.findActiveForWebsite(a.websiteId, a.organizationId)).toBeNull();

    const running = await repo.createQueued(a);
    await prisma.scan.update({ where: { id: running.id }, data: { status: 'running' } });

    expect((await repo.findActiveForWebsite(a.websiteId, a.organizationId))?.id).toBe(running.id);
  });

  it('marks a scan failed only within its organization', async () => {
    const a = await seedWebsite();
    const b = await seedWebsite();
    const scan = await repo.createQueued(a);

    await repo.markFailed(scan.id, b.organizationId, 'nope');
    expect((await repo.findInOrg(scan.id, a.organizationId))?.status).toBe('queued');

    await repo.markFailed(scan.id, a.organizationId, 'stale');
    const reread = await repo.findInOrg(scan.id, a.organizationId);
    expect(reread?.status).toBe('failed');
    expect(reread?.error).toBe('stale');
    expect(reread?.finishedAt).not.toBeNull();
  });

  it('paginates pages and refuses another organization', async () => {
    const a = await seedWebsite();
    const b = await seedWebsite();
    const scan = await repo.createQueued(a);
    await prisma.page.createMany({
      data: ['/c', '/a', '/b'].map((path, index) => ({
        scanId: scan.id,
        url: `https://site.test${path}`,
        path,
        depth: index === 0 ? 0 : 1,
        statusCode: 200,
      })),
    });

    expect(await repo.listPages(scan.id, b.organizationId, 10, 0)).toBeNull();

    const firstPage = await repo.listPages(scan.id, a.organizationId, 2, 0);
    expect(firstPage?.total).toBe(3);
    expect(firstPage?.items.map((page) => page.path)).toEqual(['/c', '/a']);

    const secondPage = await repo.listPages(scan.id, a.organizationId, 2, 2);
    expect(secondPage?.items.map((page) => page.path)).toEqual(['/b']);
  });
});
