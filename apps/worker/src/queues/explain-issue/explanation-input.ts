import { gunzipSync } from 'node:zlib';

import type { PrismaClient } from '@wintel/database';
import {
  AUDIT_RULES,
  type AuditRuleId,
  EXPLANATION_PAGE_LIMIT,
  type IssueSeverity,
} from '@wintel/types';

import { type PageFacts, extractPageFacts } from '../scan-audit/page-facts';

export interface ExplanationPageInput {
  path: string;
  message: string;
  evidence: Record<string, unknown>;
  facts: PageFacts | null;
}

export interface ExplanationInput {
  domain: string;
  rule: { id: AuditRuleId; title: string; severity: IssueSeverity; description: string };
  issueCount: number;
  affectedPageCount: number;
  pages: ExplanationPageInput[];
}

function readFacts(html: Uint8Array | undefined): PageFacts | null {
  if (!html) {
    return null;
  }
  try {
    return extractPageFacts(gunzipSync(html).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * The model's entire view of the problem, built only from stored audit data. Pages are sorted by
 * path and limited, so the same audit always yields the same input; raw HTML is reduced to facts.
 */
export async function buildExplanationInput(
  client: PrismaClient,
  explanation: { auditId: string; ruleId: string },
): Promise<ExplanationInput> {
  const ruleId = explanation.ruleId as AuditRuleId;
  const rule = AUDIT_RULES[ruleId];

  const audit = await client.audit.findUniqueOrThrow({
    where: { id: explanation.auditId },
    select: { scan: { select: { website: { select: { domain: true } } } } },
  });

  const issues = await client.issue.findMany({
    where: { auditId: explanation.auditId, ruleId },
    select: {
      message: true,
      evidence: true,
      pageId: true,
      page: { select: { path: true, content: { select: { html: true } } } },
    },
    orderBy: [{ page: { path: 'asc' } }, { message: 'asc' }],
  });

  const pageIds = new Set(issues.map((issue) => issue.pageId));
  const seen = new Set<string>();
  const pages: ExplanationPageInput[] = [];
  for (const issue of issues) {
    if (seen.has(issue.page.path) || pages.length >= EXPLANATION_PAGE_LIMIT) {
      continue;
    }
    seen.add(issue.page.path);
    pages.push({
      path: issue.page.path,
      message: issue.message,
      evidence: (issue.evidence ?? {}) as Record<string, unknown>,
      facts: readFacts(issue.page.content?.html),
    });
  }

  return {
    domain: audit.scan.website.domain,
    rule: { id: ruleId, title: rule.title, severity: rule.severity, description: rule.description },
    issueCount: issues.length,
    affectedPageCount: pageIds.size,
    pages,
  };
}
