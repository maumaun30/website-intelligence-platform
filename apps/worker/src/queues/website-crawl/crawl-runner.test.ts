import { SCAN_DEADLINE_MS, type WebsiteCrawlJob } from '@wintel/types';
import { describe, expect, it, vi } from 'vitest';

import { type CrawledPage, CrawlRunner, RootUnreachableError } from './crawl-runner';
import type { FetchResult } from './page-fetcher';
import { ALLOW_ALL, parseRobotsTxt } from './robots-txt';

type FakePage = { status?: number; html?: string; contentType?: string } | 'network-error';

function fakeFetcher(site: Record<string, FakePage>) {
  const calls: string[] = [];
  return {
    calls,
    fetch: (url: string): Promise<FetchResult> => {
      calls.push(url);
      const page = site[url];
      if (page === 'network-error') {
        return Promise.resolve({ kind: 'error', error: 'ECONNREFUSED', responseTimeMs: 1 });
      }
      const status = page?.status ?? (page ? 200 : 404);
      const contentType = page?.contentType ?? 'text/html';
      const body = page?.html ?? '';
      return Promise.resolve({
        kind: 'response',
        finalUrl: url,
        statusCode: status,
        contentType,
        byteSize: body.length,
        responseTimeMs: 1,
        body: contentType === 'text/html' ? body : null,
        tooLarge: false,
      });
    },
  };
}

function links(...paths: string[]): string {
  return paths.map((path) => `<a href="${path}">x</a>`).join('');
}

function job(overrides: Partial<WebsiteCrawlJob> = {}): WebsiteCrawlJob {
  return {
    scanId: 's1',
    websiteId: 'w1',
    organizationId: 'o1',
    url: 'https://acme.test',
    domain: 'acme.test',
    maxDepth: 5,
    maxPages: 100,
    includePaths: [],
    excludePaths: [],
    respectRobotsTxt: true,
    ...overrides,
  };
}

function makeRunner(
  site: Record<string, FakePage>,
  extra: { robots?: string; clock?: () => number } = {},
) {
  const fetcher = fakeFetcher(site);
  const recorded: CrawledPage[] = [];
  const runner = new CrawlRunner({
    fetcher,
    loadRobots: () =>
      Promise.resolve(
        extra.robots === undefined ? ALLOW_ALL : parseRobotsTxt(extra.robots, 'wintelbot'),
      ),
    sink: { recordPage: (page) => Promise.resolve(void recorded.push(page)) },
    clock: extra.clock,
    sleep: vi.fn(() => Promise.resolve()),
  });
  return { runner, fetcher, recorded };
}

describe('CrawlRunner', () => {
  it('crawls every reachable internal page once, through cycles, and finishes', async () => {
    const { runner, recorded } = makeRunner({
      'https://acme.test/': { html: links('/a', '/b', '/', 'https://other.test/x') },
      'https://acme.test/a': { html: links('/b', '/a#top') },
      'https://acme.test/b': { html: links('/a') },
    });

    const result = await runner.run(job());

    expect(result).toEqual({ pagesCrawled: 3, pagesFailed: 0, stopReason: 'finished' });
    expect(recorded.map((page) => page.url).sort()).toEqual([
      'https://acme.test/',
      'https://acme.test/a',
      'https://acme.test/b',
    ]);
    expect(recorded[0]!.links).toContainEqual({ url: 'https://other.test/x', internal: false });
  });

  it('records external links but never fetches them', async () => {
    const { runner, fetcher } = makeRunner({
      'https://acme.test/': { html: links('https://other.test/x', 'https://blog.acme.test/') },
    });

    await runner.run(job());

    expect(fetcher.calls).toEqual(['https://acme.test/']);
  });

  it('counts 404s and request errors as failed pages without stopping', async () => {
    const { runner, recorded } = makeRunner({
      'https://acme.test/': { html: links('/missing', '/down') },
      'https://acme.test/down': 'network-error',
    });

    const result = await runner.run(job());

    expect(result).toEqual({ pagesCrawled: 3, pagesFailed: 2, stopReason: 'finished' });
    expect(recorded.find((page) => page.url.endsWith('/down'))?.error).toBe('ECONNREFUSED');
    expect(recorded.find((page) => page.url.endsWith('/missing'))?.statusCode).toBe(404);
  });

  it('stops at maxDepth and says so', async () => {
    const { runner, fetcher } = makeRunner({
      'https://acme.test/': { html: links('/1') },
      'https://acme.test/1': { html: links('/2') },
      'https://acme.test/2': { html: links('/3') },
    });

    const result = await runner.run(job({ maxDepth: 1 }));

    expect(result.stopReason).toBe('maxDepth');
    expect(fetcher.calls).toEqual(['https://acme.test/', 'https://acme.test/1']);
  });

  it('stops at maxPages and says so', async () => {
    const { runner } = makeRunner({
      'https://acme.test/': { html: links('/a', '/b', '/c', '/d') },
    });

    const result = await runner.run(job({ maxPages: 3 }));

    expect(result).toMatchObject({ pagesCrawled: 3, stopReason: 'maxPages' });
  });

  it('reports finished, not maxPages, when the site has exactly maxPages pages', async () => {
    const { runner } = makeRunner({
      'https://acme.test/': { html: links('/a') },
      'https://acme.test/a': {},
    });

    expect((await runner.run(job({ maxPages: 2 }))).stopReason).toBe('finished');
  });

  it('stops at the deadline and keeps what it crawled', async () => {
    let now = 0;
    const { runner, recorded } = makeRunner(
      { 'https://acme.test/': { html: links('/a') }, 'https://acme.test/a': {} },
      { clock: () => now },
    );
    const originalPush = recorded.push.bind(recorded);
    recorded.push = (...pages: CrawledPage[]) => {
      now = SCAN_DEADLINE_MS;
      return originalPush(...pages);
    };

    const result = await runner.run(job());

    expect(result).toMatchObject({ pagesCrawled: 1, stopReason: 'deadline' });
  });

  it('applies include and exclude path rules', async () => {
    const { runner, fetcher } = makeRunner({
      'https://acme.test/': { html: links('/blog/a', '/blog/drafts/b', '/shop') },
      'https://acme.test/blog/a': {},
    });

    await runner.run(job({ includePaths: ['/blog'], excludePaths: ['/blog/drafts'] }));

    expect(fetcher.calls).toEqual(['https://acme.test/', 'https://acme.test/blog/a']);
  });

  it('honours robots.txt only when the website asks for it', async () => {
    const site = {
      'https://acme.test/': { html: links('/private/x', '/ok') },
      'https://acme.test/ok': {},
    };
    const robots = 'User-agent: *\nDisallow: /private\n';

    const honoured = makeRunner(site, { robots });
    await honoured.runner.run(job({ respectRobotsTxt: true }));
    expect(honoured.fetcher.calls).not.toContain('https://acme.test/private/x');

    const ignored = makeRunner(site, { robots });
    await ignored.runner.run(job({ respectRobotsTxt: false }));
    expect(ignored.fetcher.calls).toContain('https://acme.test/private/x');
  });

  it('fetches one URL at a time when robots.txt sets a crawl delay', async () => {
    const { runner, fetcher } = makeRunner(
      {
        'https://acme.test/': { html: links('/a', '/b') },
        'https://acme.test/a': {},
        'https://acme.test/b': {},
      },
      { robots: 'User-agent: *\nCrawl-delay: 1\n' },
    );

    const result = await runner.run(job());

    expect(result.pagesCrawled).toBe(3);
    expect(fetcher.calls).toHaveLength(3);
  });

  it('does not parse links out of non-HTML pages', async () => {
    const { runner, recorded } = makeRunner({
      'https://acme.test/': { html: links('/doc.pdf') },
      'https://acme.test/doc.pdf': { contentType: 'application/pdf', html: links('/secret') },
    });

    const result = await runner.run(job());

    expect(result.pagesCrawled).toBe(2);
    expect(recorded.find((page) => page.url.endsWith('.pdf'))?.links).toEqual([]);
  });

  it('throws RootUnreachableError when the root cannot be fetched', async () => {
    const { runner } = makeRunner({ 'https://acme.test/': 'network-error' });

    await expect(runner.run(job())).rejects.toBeInstanceOf(RootUnreachableError);
  });
});
