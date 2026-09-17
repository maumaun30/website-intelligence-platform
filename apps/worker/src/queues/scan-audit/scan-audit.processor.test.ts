import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadAuditContext } from './audit-context-loader';
import { ScanAuditProcessor } from './scan-audit.processor';

let prisma: PrismaClient;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const html = (title: string, description: string, body = '<h1>Heading</h1>') =>
  `<html><head><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="/"></head><body>${body}</body></html>`;

async function seedAudit() {
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
      name: 'Audit',
      url: 'https://audit.test',
      domain: `audit-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      verificationStatus: 'verified',
    },
  });
  const scan = await prisma.scan.create({
    data: { websiteId: website.id, organizationId, status: 'completed', stopReason: 'finished' },
  });

  const pages = [
    { path: '/', statusCode: 200, html: html('Home page title', 'Home description') },
    {
      path: '/about',
      statusCode: 200,
      html: html('Home page title', 'About description', '<p>no heading</p>'),
    },
    { path: '/gone', statusCode: 404, html: null },
  ];
  const ids: Record<string, string> = {};
  for (const entry of pages) {
    const created = await prisma.page.create({
      data: {
        scanId: scan.id,
        url: `https://audit.test${entry.path}`,
        path: entry.path,
        depth: entry.path === '/' ? 0 : 1,
        statusCode: entry.statusCode,
        contentType: 'text/html',
        byteSize: 100,
        responseTimeMs: 10,
      },
    });
    ids[entry.path] = created.id;
    if (entry.html) {
      await prisma.pageContent.create({ data: { pageId: created.id, html: gzipSync(entry.html) } });
    }
  }
  await prisma.pageLink.createMany({
    data: [
      { pageId: ids['/']!, url: 'https://audit.test/about', internal: true },
      { pageId: ids['/']!, url: 'https://audit.test/gone', internal: true },
      { pageId: ids['/']!, url: 'https://audit.test/unknown', internal: true },
    ],
  });

  const audit = await prisma.audit.create({ data: { scanId: scan.id, organizationId } });
  return { audit, ids, job: { data: { auditId: audit.id, scanId: scan.id } } as Job };
}

function processor(loader = loadAuditContext) {
  return new ScanAuditProcessor({ client: prisma } as never, loader, logger as never);
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ScanAuditProcessor', () => {
  it('audits stored pages and records issues and counts', async () => {
    const { audit, ids, job } = await seedAudit();

    await processor().process(job);

    const stored = await prisma.audit.findUniqueOrThrow({ where: { id: audit.id } });
    expect(stored).toMatchObject({
      status: 'completed',
      criticalCount: 1,
      warningCount: 4,
      noticeCount: 0,
    });

    const issues = await prisma.issue.findMany({ where: { auditId: audit.id } });
    const summary = issues.map((issue) => `${issue.ruleId}@${issue.pageId}`).sort();
    expect(summary).toEqual(
      [
        `broken-internal-link@${ids['/']}`,
        `client-error@${ids['/gone']}`,
        `duplicate-title@${ids['/']}`,
        `duplicate-title@${ids['/about']}`,
        `missing-h1@${ids['/about']}`,
      ].sort(),
    );
  });

  it('replaces issues on a re-run instead of appending', async () => {
    const { audit, job } = await seedAudit();
    await processor().process(job);
    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'queued' } });

    await processor().process(job);

    expect(await prisma.issue.count({ where: { auditId: audit.id } })).toBe(5);
  });

  it('skips an audit that is not queued', async () => {
    const { audit, job } = await seedAudit();
    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'running' } });
    const loader = vi.fn(loadAuditContext);

    await processor(loader).process(job);

    expect(loader).not.toHaveBeenCalled();
  });

  it('marks the audit failed, keeps prior issues, and rethrows', async () => {
    const { audit, job } = await seedAudit();
    await processor().process(job);
    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'queued' } });

    await expect(
      processor(() => Promise.reject(new Error('loader exploded'))).process(job),
    ).rejects.toThrow('loader exploded');

    const stored = await prisma.audit.findUniqueOrThrow({ where: { id: audit.id } });
    expect(stored).toMatchObject({ status: 'failed', error: 'loader exploded' });
    expect(await prisma.issue.count({ where: { auditId: audit.id } })).toBe(5);
  });
});
