import { SCAN_DEADLINE_MS, type ScanStopReason, type WebsiteCrawlJob } from '@wintel/types';

import { CRAWL_CONCURRENCY, MAX_CRAWL_DELAY_MS } from './crawl.constants';
import { parseHtml } from './html-parser';
import type { FetchResult } from './page-fetcher';
import { ALLOW_ALL, type RobotsRules } from './robots-txt';
import { canonicalizeUrl, isPathAllowed, isSameSite } from './url';

export interface CrawledLink {
  url: string;
  internal: boolean;
}

export interface CrawledPage {
  url: string;
  path: string;
  depth: number;
  statusCode: number | null;
  contentType: string | null;
  byteSize: number | null;
  responseTimeMs: number | null;
  title: string | null;
  redirectedTo: string | null;
  error: string | null;
  html: string | null;
  links: CrawledLink[];
}

export interface CrawlSink {
  recordPage(page: CrawledPage): Promise<void>;
}

export interface CrawlResult {
  pagesCrawled: number;
  pagesFailed: number;
  stopReason: ScanStopReason;
}

export interface CrawlRunnerDeps {
  fetcher: { fetch(url: string): Promise<FetchResult> };
  loadRobots: (origin: string) => Promise<RobotsRules>;
  sink: CrawlSink;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** The site itself did not answer, so there is nothing to crawl — a scan failure, not a page row. */
export class RootUnreachableError extends Error {
  constructor(url: string, cause: string) {
    super(`Could not reach ${url}: ${cause}`);
    this.name = 'RootUnreachableError';
  }
}

/** A page counts as failed when the request failed outright or the server answered 4xx/5xx. */
export function isFailedPage(page: CrawledPage): boolean {
  return page.error !== null || (page.statusCode !== null && page.statusCode >= 400);
}

interface FrontierItem {
  url: string;
  depth: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Breadth-first crawl of one website within its scan config. Holds no I/O of its own — fetching,
 * robots.txt, and persistence are injected — so every limit and stop reason is testable against an
 * in-memory site. URLs are fetched in waves of up to CRAWL_CONCURRENCY, or one at a time with a
 * pause when robots.txt sets a crawl delay.
 */
export class CrawlRunner {
  private readonly clock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: CrawlRunnerDeps) {
    this.clock = deps.clock ?? Date.now;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  async run(job: WebsiteCrawlJob): Promise<CrawlResult> {
    const started = this.clock();
    const rootUrl = canonicalizeUrl(job.url);
    if (rootUrl === null) {
      throw new RootUnreachableError(job.url, 'invalid URL');
    }

    const robots = job.respectRobotsTxt
      ? await this.deps.loadRobots(new URL(rootUrl).origin)
      : ALLOW_ALL;
    const waveSize = robots.crawlDelayMs > 0 ? 1 : CRAWL_CONCURRENCY;
    const delayMs = Math.min(robots.crawlDelayMs, MAX_CRAWL_DELAY_MS);

    const visited = new Set<string>([rootUrl]);
    const frontier: FrontierItem[] = [{ url: rootUrl, depth: 0 }];
    let pagesCrawled = 0;
    let pagesFailed = 0;
    let droppedForDepth = false;
    let isFirstWave = true;

    const result = (stopReason: ScanStopReason): CrawlResult => ({
      pagesCrawled,
      pagesFailed,
      stopReason,
    });

    while (frontier.length > 0) {
      if (this.clock() - started >= SCAN_DEADLINE_MS) {
        return result('deadline');
      }
      if (pagesCrawled >= job.maxPages) {
        return result('maxPages');
      }
      if (!isFirstWave && delayMs > 0) {
        await this.sleep(delayMs);
      }

      const wave = frontier.splice(0, Math.min(waveSize, job.maxPages - pagesCrawled));
      const pages = await Promise.all(wave.map((item) => this.crawlOne(item, job)));

      for (const page of pages) {
        if (isFirstWave && page.depth === 0 && page.statusCode === null && page.error !== null) {
          throw new RootUnreachableError(page.url, page.error);
        }

        await this.deps.sink.recordPage(page);
        pagesCrawled++;
        if (isFailedPage(page)) {
          pagesFailed++;
        }
        if (page.redirectedTo !== null && isSameSite(page.redirectedTo, job.domain)) {
          visited.add(page.redirectedTo);
        }

        for (const link of page.links) {
          if (!link.internal || visited.has(link.url)) {
            continue;
          }
          if (page.depth + 1 > job.maxDepth) {
            droppedForDepth = true;
            continue;
          }
          const target = new URL(link.url);
          if (!isPathAllowed(target.pathname, job.includePaths, job.excludePaths)) {
            continue;
          }
          if (!robots.isAllowed(`${target.pathname}${target.search}`)) {
            continue;
          }
          visited.add(link.url);
          frontier.push({ url: link.url, depth: page.depth + 1 });
        }
      }
      isFirstWave = false;
    }

    return result(droppedForDepth ? 'maxDepth' : 'finished');
  }

  private async crawlOne(item: FrontierItem, job: WebsiteCrawlJob): Promise<CrawledPage> {
    const fetched = await this.deps.fetcher.fetch(item.url);
    const base = {
      url: item.url,
      path: new URL(item.url).pathname,
      depth: item.depth,
      responseTimeMs: fetched.responseTimeMs,
    };

    if (fetched.kind === 'error') {
      return {
        ...base,
        statusCode: null,
        contentType: null,
        byteSize: null,
        title: null,
        redirectedTo: null,
        error: fetched.error,
        html: null,
        links: [],
      };
    }

    const redirectedTo = fetched.finalUrl === item.url ? null : canonicalizeUrl(fetched.finalUrl);
    const parsed =
      fetched.body !== null && isSameSite(fetched.finalUrl, job.domain)
        ? parseHtml(fetched.body, fetched.finalUrl)
        : { title: null, links: [] };

    return {
      ...base,
      statusCode: fetched.statusCode,
      contentType: fetched.contentType,
      byteSize: fetched.byteSize,
      title: parsed.title,
      redirectedTo,
      error: fetched.tooLarge ? 'Response exceeded the 2 MB limit' : null,
      html: fetched.body,
      links: parsed.links.map((url) => ({ url, internal: isSameSite(url, job.domain) })),
    };
  }
}
