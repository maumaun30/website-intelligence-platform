import { z } from 'zod';

/** Name of the queue carrying crawl jobs. API produces; worker consumes. */
export const WEBSITE_CRAWL_QUEUE = 'website-crawl';

/**
 * Wall-clock budget for one scan. The worker stops crawling when it is spent; the API treats a
 * `running` scan older than this as abandoned by a dead worker.
 */
export const SCAN_DEADLINE_MS = 10 * 60 * 1000;

/**
 * Everything the worker needs to crawl, snapshotted when the scan starts so a scan-config edit
 * mid-flight cannot change the rules of a running crawl.
 */
export const websiteCrawlJobSchema = z.object({
  scanId: z.string(),
  websiteId: z.string(),
  organizationId: z.string(),
  url: z.string(),
  domain: z.string(),
  maxDepth: z.number().int().min(0),
  maxPages: z.number().int().min(1),
  includePaths: z.array(z.string()),
  excludePaths: z.array(z.string()),
  respectRobotsTxt: z.boolean(),
});

export type WebsiteCrawlJob = z.infer<typeof websiteCrawlJobSchema>;
