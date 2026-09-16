import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type PrismaClient } from './index';

let prisma: PrismaClient;

async function seedOrgAndUser(): Promise<{ organizationId: string; userId: string }> {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'Owner', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'Org', slug: `org-${organizationId.slice(0, 8)}` },
  });
  return { organizationId, userId };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Website model', () => {
  it('persists a website with scan-config defaults and a pending status', async () => {
    const { organizationId, userId } = await seedOrgAndUser();

    const website = await prisma.website.create({
      data: {
        organizationId,
        createdById: userId,
        name: 'Acme',
        url: 'https://acme.test',
        domain: 'acme.test',
        verificationToken: 'tok-1',
      },
    });

    expect(website.verificationStatus).toBe('pending');
    expect(website.maxDepth).toBe(3);
    expect(website.maxPages).toBe(500);
    expect(website.respectRobotsTxt).toBe(true);
    expect(website.scanFrequency).toBe('manual');
    expect(website.includePaths).toEqual([]);
  });

  it('rejects a duplicate domain within the same organization', async () => {
    const { organizationId, userId } = await seedOrgAndUser();
    const base = {
      organizationId,
      createdById: userId,
      name: 'Dup',
      url: 'https://dup.test',
      domain: 'dup.test',
      verificationToken: 'tok',
    };
    await prisma.website.create({ data: base });

    await expect(
      prisma.website.create({ data: { ...base, url: 'https://dup.test/2' } }),
    ).rejects.toThrow();
  });

  it('cascades website deletion when its organization is deleted', async () => {
    const { organizationId, userId } = await seedOrgAndUser();
    const website = await prisma.website.create({
      data: {
        organizationId,
        createdById: userId,
        name: 'Cascade',
        url: 'https://cascade.test',
        domain: 'cascade.test',
        verificationToken: 'tok',
      },
    });

    await prisma.organization.delete({ where: { id: organizationId } });

    expect(await prisma.website.findUnique({ where: { id: website.id } })).toBeNull();
  });
});
