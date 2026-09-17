import { AUDIT_RULE_IDS, type AuditRuleId } from '@wintel/types';
import { describe, expect, it } from 'vitest';

import {
  type AuditContext,
  type AuditLink,
  type AuditPage,
  buildAuditContext,
} from '../audit-context';
import type { PageFacts } from '../page-facts';
import { AUDIT_RULE_IMPLEMENTATIONS } from './index';

function page(path: string, overrides: Partial<AuditPage> = {}): AuditPage {
  return {
    id: path,
    url: `https://acme.test${path}`,
    path,
    statusCode: 200,
    contentType: 'text/html',
    byteSize: 1000,
    responseTimeMs: 100,
    redirectedTo: null,
    error: null,
    ...overrides,
  };
}

function facts(overrides: Partial<PageFacts> = {}): PageFacts {
  return {
    title: 'A perfectly fine title',
    metaDescription: 'A description',
    h1Count: 1,
    hasCanonical: true,
    robotsContent: null,
    ...overrides,
  };
}

function context(
  entries: Array<{ page: AuditPage; facts?: PageFacts; links?: string[] }>,
): AuditContext {
  const factMap = new Map<string, PageFacts>();
  const linkMap = new Map<string, AuditLink[]>();
  for (const entry of entries) {
    if (entry.facts) {
      factMap.set(entry.page.id, entry.facts);
    }
    linkMap.set(
      entry.page.id,
      (entry.links ?? []).map((url) => ({ url, internal: url.startsWith('https://acme.test') })),
    );
  }
  return buildAuditContext(
    entries.map((entry) => entry.page),
    factMap,
    linkMap,
  );
}

function run(ruleId: AuditRuleId, ctx: AuditContext) {
  const rule = AUDIT_RULE_IMPLEMENTATIONS.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new Error(`no implementation for ${ruleId}`);
  }
  return rule.evaluate(ctx);
}

describe('rule registry', () => {
  it('implements every catalog rule exactly once', () => {
    expect(AUDIT_RULE_IMPLEMENTATIONS.map((rule) => rule.id).sort()).toEqual(
      [...AUDIT_RULE_IDS].sort(),
    );
  });
});

describe('status rules', () => {
  it('server-error fires on 5xx and on request errors, client-error only on 4xx', () => {
    const ctx = context([
      { page: page('/500', { statusCode: 503 }) },
      { page: page('/down', { statusCode: null, error: 'ECONNREFUSED' }) },
      { page: page('/404', { statusCode: 404 }) },
      { page: page('/ok') },
    ]);

    expect(run('server-error', ctx).map((issue) => issue.pageId)).toEqual(['/500', '/down']);
    expect(run('client-error', ctx).map((issue) => issue.pageId)).toEqual(['/404']);
  });

  it('flags slow and large pages above the thresholds only', () => {
    const ctx = context([
      { page: page('/slow', { responseTimeMs: 2001 }) },
      { page: page('/edge', { responseTimeMs: 2000, byteSize: 1_000_000 }) },
      { page: page('/big', { byteSize: 1_000_001 }) },
    ]);

    expect(run('slow-response', ctx)).toEqual([
      expect.objectContaining({ pageId: '/slow', evidence: { responseTimeMs: 2001 } }),
    ]);
    expect(run('large-page', ctx).map((issue) => issue.pageId)).toEqual(['/big']);
  });
});

describe('link rules', () => {
  it('reports links to crawled pages that failed, and ignores unknown and healthy targets', () => {
    const ctx = context([
      {
        page: page('/'),
        facts: facts(),
        links: [
          'https://acme.test/missing',
          'https://acme.test/down',
          'https://acme.test/ok',
          'https://acme.test/never-crawled',
          'https://other.test/broken',
          'https://acme.test/huge',
        ],
      },
      { page: page('/missing', { statusCode: 404 }) },
      { page: page('/down', { statusCode: null, error: 'ETIMEDOUT' }) },
      { page: page('/ok') },
      { page: page('/huge', { error: 'Response exceeded the 2 MB limit' }) },
    ]);

    const issues = run('broken-internal-link', ctx);

    expect(issues.map((issue) => issue.evidence.targetUrl)).toEqual([
      'https://acme.test/missing',
      'https://acme.test/down',
    ]);
    expect(issues.every((issue) => issue.pageId === '/')).toBe(true);
  });

  it('reports links to redirecting pages', () => {
    const ctx = context([
      { page: page('/'), links: ['https://acme.test/old'] },
      { page: page('/old', { redirectedTo: 'https://acme.test/new' }) },
    ]);

    expect(run('redirected-link', ctx)).toEqual([
      expect.objectContaining({
        pageId: '/',
        evidence: { targetUrl: 'https://acme.test/old', redirectedTo: 'https://acme.test/new' },
      }),
    ]);
  });
});

describe('content rules', () => {
  it('only evaluates HTML pages', () => {
    const ctx = context([{ page: page('/pdf', { contentType: 'application/pdf' }) }]);

    for (const ruleId of ['missing-title', 'missing-h1', 'missing-canonical'] as const) {
      expect(run(ruleId, ctx)).toEqual([]);
    }
  });

  it('keeps missing-title and title-length mutually exclusive', () => {
    const ctx = context([
      { page: page('/none'), facts: facts({ title: null }) },
      { page: page('/short'), facts: facts({ title: 'Hi' }) },
      { page: page('/long'), facts: facts({ title: 'x'.repeat(61) }) },
      { page: page('/fine'), facts: facts({ title: 'Exactly ten' }) },
    ]);

    expect(run('missing-title', ctx).map((issue) => issue.pageId)).toEqual(['/none']);
    expect(run('title-length', ctx).map((issue) => issue.pageId)).toEqual(['/short', '/long']);
  });

  it('flags every page sharing a title or description, with the duplicate count', () => {
    const ctx = context([
      { page: page('/a'), facts: facts({ title: 'Same title here', metaDescription: 'Same' }) },
      { page: page('/b'), facts: facts({ title: 'Same title here', metaDescription: 'Same' }) },
      { page: page('/c'), facts: facts({ title: 'Unique title here', metaDescription: null }) },
    ]);

    expect(run('duplicate-title', ctx)).toEqual([
      expect.objectContaining({
        pageId: '/a',
        evidence: { title: 'Same title here', duplicateCount: 2 },
      }),
      expect.objectContaining({
        pageId: '/b',
        evidence: { title: 'Same title here', duplicateCount: 2 },
      }),
    ]);
    expect(run('duplicate-meta-description', ctx).map((issue) => issue.pageId)).toEqual([
      '/a',
      '/b',
    ]);
    expect(run('missing-meta-description', ctx).map((issue) => issue.pageId)).toEqual(['/c']);
  });

  it('keeps missing-h1 and multiple-h1 mutually exclusive', () => {
    const ctx = context([
      { page: page('/zero'), facts: facts({ h1Count: 0 }) },
      { page: page('/one'), facts: facts({ h1Count: 1 }) },
      { page: page('/two'), facts: facts({ h1Count: 2 }) },
    ]);

    expect(run('missing-h1', ctx).map((issue) => issue.pageId)).toEqual(['/zero']);
    expect(run('multiple-h1', ctx)).toEqual([
      expect.objectContaining({ pageId: '/two', evidence: { count: 2 } }),
    ]);
  });

  it('flags missing canonicals and noindex pages', () => {
    const ctx = context([
      { page: page('/no-canonical'), facts: facts({ hasCanonical: false }) },
      { page: page('/hidden'), facts: facts({ robotsContent: 'NoIndex, follow' }) },
      { page: page('/follow'), facts: facts({ robotsContent: 'index, follow' }) },
    ]);

    expect(run('missing-canonical', ctx).map((issue) => issue.pageId)).toEqual(['/no-canonical']);
    expect(run('noindex', ctx)).toEqual([
      expect.objectContaining({ pageId: '/hidden', evidence: { content: 'NoIndex, follow' } }),
    ]);
  });
});

describe('redirect aliases', () => {
  it('audits a redirect whose target was crawled only as a link target', () => {
    const shared = facts({ title: 'About', h1Count: 0 });
    const ctx = context([
      {
        page: page('/'),
        facts: facts(),
        links: ['https://acme.test/old', 'https://acme.test/about'],
      },
      {
        page: page('/old', { redirectedTo: 'https://acme.test/about', responseTimeMs: 3000 }),
        facts: shared,
        links: ['https://acme.test/boom'],
      },
      {
        page: page('/about', { responseTimeMs: 3000 }),
        facts: shared,
        links: ['https://acme.test/boom'],
      },
      { page: page('/boom', { statusCode: 500 }) },
    ]);

    expect(run('missing-h1', ctx).map((issue) => issue.pageId)).toEqual(['/about']);
    expect(run('duplicate-title', ctx)).toEqual([]);
    expect(run('slow-response', ctx).map((issue) => issue.pageId)).toEqual(['/about']);
    expect(run('broken-internal-link', ctx).map((issue) => issue.pageId)).toEqual(['/about']);
    expect(run('redirected-link', ctx).map((issue) => issue.pageId)).toEqual(['/']);
  });

  it('still audits a redirect whose target was not crawled', () => {
    const ctx = context([
      {
        page: page('/old', { redirectedTo: 'https://acme.test/elsewhere' }),
        facts: facts({ h1Count: 0 }),
      },
    ]);

    expect(run('missing-h1', ctx).map((issue) => issue.pageId)).toEqual(['/old']);
  });
});
