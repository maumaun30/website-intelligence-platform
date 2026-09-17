import { z } from 'zod';

export const SCAN_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export const SCAN_STOP_REASONS = ['finished', 'maxPages', 'maxDepth', 'deadline'] as const;
/** A website may have at most one scan in these states at a time. */
export const ACTIVE_SCAN_STATUSES = ['queued', 'running'] as const;

export const PAGE_LIST_DEFAULT_LIMIT = 50;
export const PAGE_LIST_MAX_LIMIT = 200;

/** A crawl of one website, as returned by the API. Dates are ISO strings over the wire. */
export const scanSchema = z.object({
  id: z.string(),
  websiteId: z.string(),
  organizationId: z.string(),
  status: z.enum(SCAN_STATUSES),
  stopReason: z.enum(SCAN_STOP_REASONS).nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  pagesCrawled: z.number().int(),
  pagesFailed: z.number().int(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** One fetched URL within a scan. `error` is set when the request itself failed. */
export const pageSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  url: z.string(),
  path: z.string(),
  depth: z.number().int(),
  statusCode: z.number().int().nullable(),
  contentType: z.string().nullable(),
  byteSize: z.number().int().nullable(),
  responseTimeMs: z.number().int().nullable(),
  title: z.string().nullable(),
  redirectedTo: z.string().nullable(),
  error: z.string().nullable(),
  fetchedAt: z.string(),
});

/** Pagination for page lists. Query strings arrive as text, hence the coercion. */
export const pageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_LIST_MAX_LIMIT).default(PAGE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export const pageListSchema = z.object({
  items: z.array(pageSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type ScanStatus = (typeof SCAN_STATUSES)[number];
export type ScanStopReason = (typeof SCAN_STOP_REASONS)[number];
export type Scan = z.infer<typeof scanSchema>;
export type Page = z.infer<typeof pageSchema>;
export type PageListQuery = z.infer<typeof pageListQuerySchema>;
export type PageList = z.infer<typeof pageListSchema>;
