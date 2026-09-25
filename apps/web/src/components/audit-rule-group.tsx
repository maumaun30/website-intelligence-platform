'use client';

import { AUDIT_RULES, type AuditRuleId } from '@wintel/types';
import { Button } from '@wintel/ui';
import { useState } from 'react';

import { AiExplanation } from '@/components/ai-explanation';
import { SeverityTag } from '@/components/severity-tag';
import { ISSUE_PAGE_SIZE, useRuleIssues } from '@/lib/use-audits';

/** One rule's findings: a summary row that expands into the affected pages. */
export function AuditRuleGroup({
  scanId,
  ruleId,
  count,
  auditUpdatedAt,
}: {
  scanId: string;
  ruleId: AuditRuleId;
  count: number;
  auditUpdatedAt: string;
}) {
  const rule = AUDIT_RULES[ruleId];
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const issues = useRuleIssues(scanId, ruleId, offset, auditUpdatedAt, open);

  return (
    <details
      className="rounded-md border border-border"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <SeverityTag severity={rule.severity} />
          <span data-testid="audit-rule-title">{rule.title}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? 'page' : 'pages'}
        </span>
      </summary>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">{rule.description}</p>
          <AiExplanation scanId={scanId} ruleId={ruleId} />
          {issues.isPending ? (
            <p className="text-xs text-muted-foreground">Loading pages…</p>
          ) : issues.isError ? (
            <p className="text-xs text-destructive">Could not load pages.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {issues.data.items.map((issue) => (
                  <li key={issue.id} className="text-xs">
                    <span className="font-medium" title={issue.page.url}>
                      {issue.page.path}
                    </span>{' '}
                    <span className="text-muted-foreground">{issue.message}</span>
                  </li>
                ))}
              </ul>
              {issues.data.total > ISSUE_PAGE_SIZE ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - ISSUE_PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + ISSUE_PAGE_SIZE >= issues.data.total}
                    onClick={() => setOffset(offset + ISSUE_PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}
