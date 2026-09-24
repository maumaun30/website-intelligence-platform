import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { PLAN_LIMITS } from '@wintel/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WebsitesRepository } from './websites.repository';

let prisma: PrismaClient;
let repo: WebsitesRepository;

async function seedOrganization() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}`, plan: 'free' },
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

describe('WebsitesRepository.createWithinQuota', () => {
  it('lets only as many concurrent creates through as the plan allows', async () => {
    const { organizationId, userId } = await seedOrganization();
    const limit = PLAN_LIMITS.free.websites;

    const results = await Promise.all(
      Array.from({ length: 5 }, (_value, index) =>
        repo.createWithinQuota({
          organizationId,
          createdById: userId,
          name: `Site ${index}`,
          url: `https://site-${index}.test`,
          domain: `site-${index}-${randomUUID().slice(0, 8)}.test`,
          verificationToken: 't',
          limit,
        }),
      ),
    );

    const created = results.filter((result) => 'website' in result);
    const refused = results.filter((result) => 'refusedWith' in result);

    expect(created).toHaveLength(limit);
    expect(refused).toHaveLength(5 - limit);
    expect(refused[0]).toMatchObject({ refusedWith: 'PLAN_WEBSITE_LIMIT', limit });
    expect(await prisma.website.count({ where: { organizationId } })).toBe(limit);
  });

  it('creates within the limit and reports the current count when refusing', async () => {
    const { organizationId, userId } = await seedOrganization();

    const first = await repo.createWithinQuota({
      organizationId,
      createdById: userId,
      name: 'First',
      url: 'https://first.test',
      domain: `first-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      limit: 1,
    });
    const second = await repo.createWithinQuota({
      organizationId,
      createdById: userId,
      name: 'Second',
      url: 'https://second.test',
      domain: `second-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      limit: 1,
    });

    expect(first).toMatchObject({ website: { organizationId, name: 'First' } });
    expect(second).toEqual({ refusedWith: 'PLAN_WEBSITE_LIMIT', limit: 1, current: 1 });
  });
});
