import { LARGE_PAGE_BYTES, SLOW_RESPONSE_MS } from '../audit.constants';
import type { AuditPage, AuditRuleImplementation } from '../audit-context';

/** A request that failed outright or a 5xx. Shared with the link rules' notion of "broken". */
export function isServerFailure(page: AuditPage): boolean {
  return (
    (page.statusCode !== null && page.statusCode >= 500) ||
    (page.statusCode === null && page.error !== null)
  );
}

export const serverErrorRule: AuditRuleImplementation = {
  id: 'server-error',
  evaluate: (ctx) =>
    ctx.pages.filter(isServerFailure).map((page) => ({
      pageId: page.id,
      ruleId: 'server-error',
      message:
        page.statusCode === null
          ? `The page could not be fetched: ${page.error ?? 'unknown error'}`
          : `The page returned ${page.statusCode}`,
      evidence: { statusCode: page.statusCode, error: page.error },
    })),
};

export const clientErrorRule: AuditRuleImplementation = {
  id: 'client-error',
  evaluate: (ctx) =>
    ctx.pages
      .filter((page) => page.statusCode !== null && page.statusCode >= 400 && page.statusCode < 500)
      .map((page) => ({
        pageId: page.id,
        ruleId: 'client-error',
        message: `The page returned ${page.statusCode}`,
        evidence: { statusCode: page.statusCode },
      })),
};

export const slowResponseRule: AuditRuleImplementation = {
  id: 'slow-response',
  evaluate: (ctx) =>
    ctx.pages
      .filter((page) => page.responseTimeMs !== null && page.responseTimeMs > SLOW_RESPONSE_MS)
      .map((page) => ({
        pageId: page.id,
        ruleId: 'slow-response',
        message: `The server took ${page.responseTimeMs} ms to respond`,
        evidence: { responseTimeMs: page.responseTimeMs },
      })),
};

export const largePageRule: AuditRuleImplementation = {
  id: 'large-page',
  evaluate: (ctx) =>
    ctx.pages
      .filter((page) => page.byteSize !== null && page.byteSize > LARGE_PAGE_BYTES)
      .map((page) => ({
        pageId: page.id,
        ruleId: 'large-page',
        message: `The page is ${(page.byteSize! / 1_000_000).toFixed(1)} MB`,
        evidence: { byteSize: page.byteSize },
      })),
};
