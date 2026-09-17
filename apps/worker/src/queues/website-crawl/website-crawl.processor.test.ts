import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CrawlRunner, type CrawlSink } from './crawl-runner';
import type { FetchResult } from './page-fetcher';
import { ALLOW_ALL } from './robots-txt';
import { WebsiteCrawlProcessor } from './website-crawl.processor';

let prisma: PrismaClient;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const SITE: Record<string, string> = {
  'https://crawl.test/': '<title>Home</title><a href="/a">A</a><a href="https://ext.test/">Ext</a>',
  'https://crawl.test/a': '<title>A</title><a href="/">Home</a><a href="/gone">Gone</a>',
};

function fakeFetch(url: string): Promise<FetchResult> {
  const html = SITE[url];
  return Promise.resolve({
    kind: 'response',
    finalUrl: url,
    statusCode: html === undefined ? 404 : 200,
    contentType: 'text/html',
    byteSize: html?.length ?? 0,
    responseTimeMs: 5,
    body: html ?? '',
    tooLarge: false,
  });
}

const runnerFactory = (sink: CrawlSink) =>
  new CrawlRunner({
    fetcher: { fetch: fakeFetch },
    loadRobots: () => Promise.resolve(ALLOW_ALL),
    sink,
  });

async function seedScan() {
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
      name: 'Crawl',
      url: 'https://crawl.test',
      domain: `crawl-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      verificationStatus: 'verified',
    },
  });
  const scan = await prisma.scan.create({ data: { websiteId: website.id, organizationId } });
  const job = {
    data: {
      scanId: scan.id,
      websiteId: website.id,
      organizationId,
      url: 'https://crawl.test',
      domain: 'crawl.test',
      maxDepth: 3,
      maxPages: 50,
      includePaths: [],
      excludePaths: [],
      respectRobotsTxt: false,
    },
  } as Job;
  return { websiteId: website.id, scanId: scan.id, organizationId, job };
}

function processor(factory: (sink: CrawlSink) => Pick<CrawlRunner, 'run'> = runnerFactory) {
  return new WebsiteCrawlProcessor({ client: prisma } as never, factory, logger as never);
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('WebsiteCrawlProcessor', () => {
  it('crawls, stores pages with content and links, and completes the scan', async () => {
    const { scanId, job } = await seedScan();

    await processor().process(job);

    const scan = await prisma.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan).toMatchObject({
      status: 'completed',
      stopReason: 'finished',
      pagesCrawled: 3,
      pagesFailed: 1,
    });
    expect(scan.startedAt).not.toBeNull();
    expect(scan.finishedAt).not.toBeNull();

    const pages = await prisma.page.findMany({
      where: { scanId },
      include: { content: true, links: true },
      orderBy: { url: 'asc' },
    });
    expect(pages.map((page) => [page.path, page.statusCode, page.depth])).toEqual([
      ['/', 200, 0],
      ['/a', 200, 1],
      ['/gone', 404, 2],
    ]);

    const home = pages[0]!;
    expect(home.title).toBe('Home');
    expect(gunzipSync(home.content!.html).toString('utf8')).toBe(SITE['https://crawl.test/']);
    expect(home.links.map((link) => [link.url, link.internal]).sort()).toEqual([
      ['https://crawl.test/a', true],
      ['https://ext.test/', false],
    ]);
  });

  it('ignores a job whose scan is no longer queued', async () => {
    const { scanId, job } = await seedScan();
    await prisma.scan.update({ where: { id: scanId }, data: { status: 'failed' } });
    const factory = vi.fn(runnerFactory);

    await processor(factory).process(job);

    expect(factory).not.toHaveBeenCalled();
    expect(await prisma.page.count({ where: { scanId } })).toBe(0);
  });

  it('marks the scan failed and rethrows when the crawl throws', async () => {
    const { scanId, job } = await seedScan();
    const failing = () => ({ run: () => Promise.reject(new Error('root down')) });

    await expect(processor(failing).process(job)).rejects.toThrow('root down');

    const scan = await prisma.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan).toMatchObject({ status: 'failed', error: 'root down' });
    expect(scan.finishedAt).not.toBeNull();
  });

  it('prunes stored HTML from the website’s older scans on completion', async () => {
    const first = await seedScan();
    await processor().process(first.job);
    const olderContent = await prisma.pageContent.count({
      where: { page: { scanId: first.scanId } },
    });
    expect(olderContent).toBeGreaterThan(0);

    const second = await prisma.scan.create({
      data: { websiteId: first.websiteId, organizationId: first.organizationId },
    });
    await processor().process({ data: { ...first.job.data, scanId: second.id } } as Job);

    expect(await prisma.pageContent.count({ where: { page: { scanId: first.scanId } } })).toBe(0);
    expect(await prisma.page.count({ where: { scanId: first.scanId } })).toBe(3);
    expect(
      await prisma.pageContent.count({ where: { page: { scanId: second.id } } }),
    ).toBeGreaterThan(0);
  });
});
