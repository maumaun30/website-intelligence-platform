import { gunzipSync } from 'node:zlib';

import type { PrismaClient } from '@wintel/database';

import { AUDIT_BATCH_SIZE } from './audit.constants';
import {
  type AuditContext,
  type AuditLink,
  type AuditPage,
  buildAuditContext,
} from './audit-context';
import { type PageFacts, extractPageFacts } from './page-facts';

export const AUDIT_CONTEXT_LOADER = Symbol('AUDIT_CONTEXT_LOADER');
export type AuditContextLoaderFn = (
  client: PrismaClient,
  scanId: string,
) => Promise<{ context: AuditContext; unreadableContent: number }>;

function isHtmlSuccess(statusCode: number | null, contentType: string | null): boolean {
  return (
    statusCode !== null &&
    statusCode >= 200 &&
    statusCode < 300 &&
    (contentType?.toLowerCase().includes('text/html') ?? false)
  );
}

/**
 * Builds the audit context a batch of pages at a time. Each batch's HTML is decompressed, reduced to
 * facts, and released before the next batch loads, so memory tracks the facts, not the markup.
 */
export async function loadAuditContext(
  client: PrismaClient,
  scanId: string,
): Promise<{ context: AuditContext; unreadableContent: number }> {
  const pages: AuditPage[] = [];
  const facts = new Map<string, PageFacts>();
  const links = new Map<string, AuditLink[]>();
  let unreadableContent = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await client.page.findMany({
      where: { scanId },
      orderBy: { id: 'asc' },
      take: AUDIT_BATCH_SIZE,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      include: { content: true, links: { select: { url: true, internal: true } } },
    });
    if (batch.length === 0) {
      break;
    }

    for (const row of batch) {
      pages.push({
        id: row.id,
        url: row.url,
        path: row.path,
        statusCode: row.statusCode,
        contentType: row.contentType,
        byteSize: row.byteSize,
        responseTimeMs: row.responseTimeMs,
        redirectedTo: row.redirectedTo,
        error: row.error,
      });
      links.set(row.id, row.links);

      if (row.content && isHtmlSuccess(row.statusCode, row.contentType)) {
        try {
          facts.set(row.id, extractPageFacts(gunzipSync(row.content.html).toString('utf8')));
        } catch {
          unreadableContent++;
        }
      }
    }
    cursor = batch[batch.length - 1]!.id;
  }

  return { context: buildAuditContext(pages, facts, links), unreadableContent };
}
