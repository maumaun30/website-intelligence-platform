import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import type { PrismaClient } from '@wintel/database';

import { MAX_CONTENT_BYTES, WRITE_BATCH_SIZE } from './crawl.constants';
import { type CrawledPage, type CrawlSink, isFailedPage } from './crawl-runner';

/**
 * Persists crawled pages in batches: one transaction per batch writes the page rows, their
 * compressed HTML, their links, and the scan's live counters, so the UI's progress numbers never
 * run ahead of the rows they count. Page ids are generated here so content and link rows can
 * reference them without a read-back.
 */
export class CrawlWriter implements CrawlSink {
  pagesCrawled = 0;
  pagesFailed = 0;
  private buffer: CrawledPage[] = [];

  constructor(
    private readonly client: PrismaClient,
    private readonly scanId: string,
  ) {}

  async recordPage(page: CrawledPage): Promise<void> {
    this.buffer.push(page);
    if (this.buffer.length >= WRITE_BATCH_SIZE) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }
    const batch = this.buffer;
    this.buffer = [];

    const pages = batch.map((page) => ({ id: randomUUID(), page }));
    const contents = pages.flatMap(({ id, page }) => {
      if (page.html === null) {
        return [];
      }
      const html = gzipSync(Buffer.from(page.html, 'utf8'));
      return html.byteLength <= MAX_CONTENT_BYTES ? [{ pageId: id, html }] : [];
    });
    const links = pages.flatMap(({ id, page }) =>
      page.links.map((link) => ({ pageId: id, url: link.url, internal: link.internal })),
    );

    const crawled = this.pagesCrawled + batch.length;
    const failed = this.pagesFailed + batch.filter(isFailedPage).length;

    await this.client.$transaction([
      this.client.page.createMany({
        data: pages.map(({ id, page }) => ({
          id,
          scanId: this.scanId,
          url: page.url,
          path: page.path,
          depth: page.depth,
          statusCode: page.statusCode,
          contentType: page.contentType,
          byteSize: page.byteSize,
          responseTimeMs: page.responseTimeMs,
          title: page.title,
          redirectedTo: page.redirectedTo,
          error: page.error,
        })),
      }),
      this.client.pageContent.createMany({ data: contents }),
      this.client.pageLink.createMany({ data: links }),
      this.client.scan.update({
        where: { id: this.scanId },
        data: { pagesCrawled: crawled, pagesFailed: failed },
      }),
    ]);

    this.pagesCrawled = crawled;
    this.pagesFailed = failed;
  }

  /** Bodies only matter for the newest scan; older scans keep their page metadata and links. */
  async pruneOlderContent(websiteId: string): Promise<void> {
    await this.client.pageContent.deleteMany({
      where: { page: { scan: { websiteId, id: { not: this.scanId } } } },
    });
  }
}
