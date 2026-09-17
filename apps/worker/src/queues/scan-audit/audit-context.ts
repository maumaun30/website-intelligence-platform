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
 *
 * `aliasIds` holds redirects whose target was crawled in the same scan. The crawler stores such a
 * redirect with the target's final response, so auditing it as a page would report every issue of
 * the target twice. Aliases stay in `pages` and `pageByUrl` so links *to* them can still be judged.
 */
export interface AuditContext {
  pages: AuditPage[];
  facts: Map<string, PageFacts>;
  pageByUrl: Map<string, AuditPage>;
  links: Map<string, AuditLink[]>;
  aliasIds: Set<string>;
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
  const pageByUrl = new Map(pages.map((page) => [page.url, page]));
  const aliasIds = new Set(
    pages
      .filter((page) => page.redirectedTo !== null && pageByUrl.has(page.redirectedTo))
      .map((page) => page.id),
  );
  return { pages, facts, links, pageByUrl, aliasIds };
}

/** Pages audited in their own right: everything except redirect aliases. */
export function ownPages(ctx: AuditContext): AuditPage[] {
  return ctx.pages.filter((page) => !ctx.aliasIds.has(page.id));
}

/** HTML pages paired with their facts, in page order, excluding redirect aliases. */
export function htmlPages(ctx: AuditContext): Array<{ page: AuditPage; facts: PageFacts }> {
  return ownPages(ctx).flatMap((page) => {
    const facts = ctx.facts.get(page.id);
    return facts ? [{ page, facts }] : [];
  });
}
