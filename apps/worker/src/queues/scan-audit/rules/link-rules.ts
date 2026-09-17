import {
  type AuditContext,
  type AuditPage,
  type AuditRuleImplementation,
  type IssueDraft,
  ownPages,
} from '../audit-context';

function isBroken(page: AuditPage): boolean {
  return (
    (page.statusCode !== null && page.statusCode >= 400) ||
    (page.statusCode === null && page.error !== null)
  );
}

/** Internal links whose target was crawled in this scan. Unknown targets are never judged. */
function* crawledTargets(ctx: AuditContext): Generator<{ source: AuditPage; target: AuditPage }> {
  for (const source of ownPages(ctx)) {
    for (const link of ctx.links.get(source.id) ?? []) {
      const target = link.internal ? ctx.pageByUrl.get(link.url) : undefined;
      if (target) {
        yield { source, target };
      }
    }
  }
}

export const brokenInternalLinkRule: AuditRuleImplementation = {
  id: 'broken-internal-link',
  evaluate: (ctx) => {
    const issues: IssueDraft[] = [];
    for (const { source, target } of crawledTargets(ctx)) {
      if (isBroken(target)) {
        issues.push({
          pageId: source.id,
          ruleId: 'broken-internal-link',
          message:
            target.statusCode === null
              ? `Links to ${target.url}, which could not be fetched`
              : `Links to ${target.url}, which returned ${target.statusCode}`,
          evidence: { targetUrl: target.url, statusCode: target.statusCode, error: target.error },
        });
      }
    }
    return issues;
  },
};

export const redirectedLinkRule: AuditRuleImplementation = {
  id: 'redirected-link',
  evaluate: (ctx) => {
    const issues: IssueDraft[] = [];
    for (const { source, target } of crawledTargets(ctx)) {
      if (target.redirectedTo !== null) {
        issues.push({
          pageId: source.id,
          ruleId: 'redirected-link',
          message: `Links to ${target.url}, which redirects to ${target.redirectedTo}`,
          evidence: { targetUrl: target.url, redirectedTo: target.redirectedTo },
        });
      }
    }
    return issues;
  },
};
