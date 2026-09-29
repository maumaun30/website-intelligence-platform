import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WebsitesRepository } from './websites.repository';

let prisma: PrismaClient;
let repo: WebsitesRepository;

async function seedOrg(): Promise<{ organizationId: string; userId: string }> {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` },
  });
  return { organizationId, userId };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new WebsitesRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('WebsitesRepository org scoping', () => {
  it('never returns another org’s websites', async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    await repo.create({
      organizationId: a.organizationId,
      createdById: a.userId,
      name: 'A site',
      url: 'https://a.test',
      domain: `a-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    });

    const listedForB = await repo.listByOrg(b.organizationId);
    expect(listedForB).toHaveLength(0);
  });

  it('findInOrg returns null for a website owned by a different org', async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    const site = await repo.create({
      organizationId: a.organizationId,
      createdById: a.userId,
      name: 'A',
      url: 'https://a2.test',
      domain: `a2-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    });

    expect(await repo.findInOrg(site.id, b.organizationId)).toBeNull();
    expect(await repo.findInOrg(site.id, a.organizationId)).not.toBeNull();
  });

  it('update scoped to the wrong org changes nothing', async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    const site = await repo.create({
      organizationId: a.organizationId,
      createdById: a.userId,
      name: 'A',
      url: 'https://a3.test',
      domain: `a3-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    });

    expect(await repo.update(site.id, b.organizationId, { name: 'hacked' })).toBeNull();
    const reread = await repo.findInOrg(site.id, a.organizationId);
    expect(reread?.name).toBe('A');
  });

  it('remove scoped to the wrong org deletes nothing', async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    const site = await repo.create({
      organizationId: a.organizationId,
      createdById: a.userId,
      name: 'A',
      url: 'https://a4.test',
      domain: `a4-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    });

    expect(await repo.remove(site.id, b.organizationId)).toBe(false);
    expect(await repo.findInOrg(site.id, a.organizationId)).not.toBeNull();

    expect(await repo.remove(site.id, a.organizationId)).toBe(true);
    expect(await repo.findInOrg(site.id, a.organizationId)).toBeNull();
  });

  it('takes the website’s scans and their pages with it', async () => {
    const a = await seedOrg();
    const site = await repo.create({
      organizationId: a.organizationId,
      createdById: a.userId,
      name: 'A',
      url: 'https://a5.test',
      domain: `a5-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    });
    const scan = await prisma.scan.create({
      data: {
        websiteId: site.id,
        organizationId: a.organizationId,
        status: 'completed',
        trigger: 'manual',
      },
    });
    await prisma.page.create({
      data: { scanId: scan.id, url: 'https://a5.test/', path: '/', depth: 0, statusCode: 200 },
    });

    await repo.remove(site.id, a.organizationId);

    // Nothing may be left pointing at a website that no longer exists.
    expect(await prisma.scan.findUnique({ where: { id: scan.id } })).toBeNull();
    expect(await prisma.page.count({ where: { scanId: scan.id } })).toBe(0);
  });
});
