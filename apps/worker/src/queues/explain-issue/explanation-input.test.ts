import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { EXPLANATION_PAGE_LIMIT } from '@wintel/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildExplanationInput } from './explanation-input';

let prisma: PrismaClient;

async function seed(pageCount: number) {
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
      name: 'E',
      url: 'https://explain.test',
      domain: `explain-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    },
  });
  const scan = await prisma.scan.create({
    data: { websiteId: website.id, organizationId, status: 'completed' },
  });
  const audit = await prisma.audit.create({
    data: { scanId: scan.id, organizationId, status: 'completed' },
  });
  for (let index = pageCount - 1; index >= 0; index--) {
    const path = `/p${String(index).padStart(2, '0')}`;
    const page = await prisma.page.create({
      data: {
        scanId: scan.id,
        url: `https://explain.test${path}`,
        path,
        depth: 1,
        statusCode: 200,
        contentType: 'text/html',
      },
    });
    if (index === 0) {
      await prisma.pageContent.create({
        data: {
          pageId: page.id,
          html: gzipSync('<title>Zero</title><meta name="description" content="D"><h1>A</h1>'),
        },
      });
    }
    await prisma.issue.create({
      data: {
        auditId: audit.id,
        pageId: page.id,
        ruleId: 'missing-canonical',
        severity: 'notice',
        message: 'no canonical',
        evidence: {},
        fingerprint: `missing-canonical|${path}|`,
      },
    });
  }
  return { domain: website.domain, auditId: audit.id };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('buildExplanationInput', () => {
  it('describes the rule and the first pages by path, with facts where content exists', async () => {
    const { domain, auditId } = await seed(12);

    const input = await buildExplanationInput(prisma, { auditId, ruleId: 'missing-canonical' });

    expect(input.domain).toBe(domain);
    expect(input.rule).toMatchObject({
      id: 'missing-canonical',
      severity: 'notice',
      title: 'Missing canonical URL',
    });
    expect(input.issueCount).toBe(12);
    expect(input.affectedPageCount).toBe(12);
    expect(input.pages).toHaveLength(EXPLANATION_PAGE_LIMIT);
    expect(input.pages.map((page) => page.path)).toEqual(
      Array.from({ length: 10 }, (_value, index) => `/p${String(index).padStart(2, '0')}`),
    );
    expect(input.pages[0]!.facts).toMatchObject({
      title: 'Zero',
      metaDescription: 'D',
      h1Count: 1,
    });
    expect(input.pages[1]!.facts).toBeNull();
  });
});
