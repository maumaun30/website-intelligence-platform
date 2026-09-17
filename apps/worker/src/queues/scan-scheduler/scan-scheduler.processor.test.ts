import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { SCAN_DEADLINE_MS } from '@wintel/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScanSchedulerProcessor } from './scan-scheduler.processor';

let prisma: PrismaClient;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const crawlQueue = { add: vi.fn() };
const organizations: string[] = [];
const users: string[] = [];

const NOW = new Date('2026-09-17T12:00:00.000Z');
const PAST = new Date('2000-01-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

async function seedWebsite(overrides: {
  verificationStatus?: 'pending' | 'verified' | 'failed';
  scanFrequency?: 'manual' | 'daily' | 'weekly';
  nextScanAt?: Date | null;
}) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  users.push(userId);
  organizations.push(organizationId);
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` },
  });
  return prisma.website.create({
    data: {
      organizationId,
      createdById: userId,
      name: 'Scheduled',
      url: 'https://scheduled.test',
      domain: `scheduled-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      verificationStatus: overrides.verificationStatus ?? 'verified',
      scanFrequency: overrides.scanFrequency ?? 'daily',
      nextScanAt: overrides.nextScanAt === undefined ? PAST : overrides.nextScanAt,
      excludePaths: ['/admin'],
    },
  });
}

function processor() {
  return new ScanSchedulerProcessor(
    { client: prisma } as never,
    crawlQueue as never,
    logger as never,
  );
}

function crawlJobsFor(websiteId: string) {
  return crawlQueue.add.mock.calls.filter(([, job]) => job.websiteId === websiteId);
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

beforeEach(() => {
  crawlQueue.add.mockReset();
  crawlQueue.add.mockResolvedValue(undefined);
});

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizations.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ScanSchedulerProcessor', () => {
  it('starts a scheduled scan of a due website and advances its schedule', async () => {
    const website = await seedWebsite({});

    await processor().runTick(NOW);

    const scans = await prisma.scan.findMany({ where: { websiteId: website.id } });
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ status: 'queued', trigger: 'scheduled' });
    expect(crawlJobsFor(website.id)).toEqual([
      [
        'crawl',
        {
          scanId: scans[0]!.id,
          websiteId: website.id,
          organizationId: website.organizationId,
          url: website.url,
          domain: website.domain,
          maxDepth: website.maxDepth,
          maxPages: website.maxPages,
          includePaths: [],
          excludePaths: ['/admin'],
          respectRobotsTxt: true,
        },
        { attempts: 1 },
      ],
    ]);
    const reread = await prisma.website.findUniqueOrThrow({ where: { id: website.id } });
    expect(reread.nextScanAt?.getTime()).toBe(NOW.getTime() + DAY);
  });

  it('skips a website with a live scan but still advances its schedule', async () => {
    const website = await seedWebsite({ scanFrequency: 'weekly' });
    await prisma.scan.create({
      data: {
        websiteId: website.id,
        organizationId: website.organizationId,
        status: 'running',
        startedAt: NOW,
      },
    });

    await processor().runTick(NOW);

    expect(crawlJobsFor(website.id)).toEqual([]);
    const reread = await prisma.website.findUniqueOrThrow({ where: { id: website.id } });
    expect(reread.nextScanAt?.getTime()).toBe(NOW.getTime() + 7 * DAY);
  });

  it('releases a stale running scan and starts a new one', async () => {
    const website = await seedWebsite({});
    const stale = await prisma.scan.create({
      data: {
        websiteId: website.id,
        organizationId: website.organizationId,
        status: 'running',
        startedAt: new Date(NOW.getTime() - SCAN_DEADLINE_MS - 1),
      },
    });

    await processor().runTick(NOW);

    expect((await prisma.scan.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(
      'failed',
    );
    expect(crawlJobsFor(website.id)).toHaveLength(1);
  });

  it('ignores manual, unverified, and not-yet-due websites', async () => {
    const manual = await seedWebsite({ scanFrequency: 'manual', nextScanAt: PAST });
    const unverified = await seedWebsite({ verificationStatus: 'pending' });
    const future = await seedWebsite({ nextScanAt: new Date(NOW.getTime() + 1000) });

    await processor().runTick(NOW);

    for (const website of [manual, unverified, future]) {
      expect(crawlJobsFor(website.id)).toEqual([]);
      const reread = await prisma.website.findUniqueOrThrow({ where: { id: website.id } });
      expect(reread.nextScanAt?.getTime()).toBe(website.nextScanAt?.getTime());
    }
  });

  it('starts nothing when another tick already claimed the website', async () => {
    const website = await seedWebsite({});
    // Simulates another tick claiming the website between selection and claim.
    class RacingProcessor extends ScanSchedulerProcessor {
      override async findDue(now: Date) {
        const rows = await super.findDue(now);
        await prisma.website.update({
          where: { id: website.id },
          data: { nextScanAt: new Date(NOW.getTime() + DAY) },
        });
        return rows;
      }
    }

    await new RacingProcessor(
      { client: prisma } as never,
      crawlQueue as never,
      logger as never,
    ).runTick(NOW);

    expect(crawlJobsFor(website.id)).toEqual([]);
    expect(await prisma.scan.count({ where: { websiteId: website.id } })).toBe(0);
  });

  it('keeps going when one website fails to start', async () => {
    const first = await seedWebsite({ nextScanAt: new Date('1999-01-01T00:00:00.000Z') });
    const second = await seedWebsite({});
    crawlQueue.add.mockRejectedValueOnce(new Error('redis down'));

    const summary = await processor().runTick(NOW);

    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(crawlJobsFor(first.id)).toHaveLength(1);
    expect(crawlJobsFor(second.id)).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
