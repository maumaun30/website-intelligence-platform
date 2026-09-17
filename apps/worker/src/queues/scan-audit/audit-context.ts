import type { AuditRuleId } from '@wintel/types';

import type { PageFacts } from './page-facts';

export interface AuditPage {
  id: string;
  url: string;
  path: string;
  statusCode: number | null;
  contentType: string | null;
  byteSize: number | null;
  responseTimeMs: number | null;
  redirectedTo: string | null;
  error: string | null;
}

export interface AuditLink {
  url: string;
  internal: boolean;
}

/**
 * Everything the rules may look at. `facts` has an entry only for HTML pages (2xx, text/html,
 * readable stored content), so "is this an HTML page" is `facts.has(page.id)`.
 */
export interface AuditContext {
  pages: AuditPage[];
  facts: Map<string, PageFacts>;
  pageByUrl: Map<string, AuditPage>;
  links: Map<string, AuditLink[]>;
}

export interface IssueDraft {
  pageId: string;
  ruleId: AuditRuleId;
  message: string;
  evidence: Record<string, unknown>;
}

export interface AuditRuleImplementation {
  id: AuditRuleId;
  evaluate(ctx: AuditContext): IssueDraft[];
}

export function buildAuditContext(
  pages: AuditPage[],
  facts: Map<string, PageFacts>,
  links: Map<string, AuditLink[]>,
): AuditContext {
  return { pages, facts, links, pageByUrl: new Map(pages.map((page) => [page.url, page])) };
}

/** HTML pages paired with their facts, in page order. */
export function htmlPages(ctx: AuditContext): Array<{ page: AuditPage; facts: PageFacts }> {
  return ctx.pages.flatMap((page) => {
    const facts = ctx.facts.get(page.id);
    return facts ? [{ page, facts }] : [];
  });
}
