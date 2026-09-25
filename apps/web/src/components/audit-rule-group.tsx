'use client';

import { AUDIT_RULES, type AuditRuleId } from '@wintel/types';
import { Button } from '@wintel/ui';
import { useState } from 'react';

import { SeverityTag } from '@/components/severity-tag';
import { ISSUE_PAGE_SIZE, useRuleIssues } from '@/lib/use-audits';

/**
 * One rule's findings as a row that expands into the affected pages. The row is controlled by the
 * audit section, which keeps one rule open at a time and explains that rule in the side panel.
 */
export function AuditRuleGroup({
  scanId,
  ruleId,
  count,
  auditUpdatedAt,
  open,
  onToggle,
}: {
  scanId: string;
  ruleId: AuditRuleId;
  count: number;
  auditUpdatedAt: string;
  open: boolean;
  onToggle: () => void;
}) {
  const rule = AUDIT_RULES[ruleId];
  const [offset, setOffset] = useState(0);
  const issues = useRuleIssues(scanId, ruleId, offset, auditUpdatedAt, open);

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex h-14 w-full items-center gap-4 px-6 text-left transition-colors ease-out hover:bg-background ${
          open ? 'bg-background' : ''
        }`}
      >
        <span className="w-24 flex-none">
          <SeverityTag severity={rule.severity} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span data-testid="audit-rule-title" className="truncate text-sm font-semibold">
            {rule.title}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">{ruleId}</span>
        </span>
        <span className="flex-none text-[13px] text-muted-foreground">
          <strong className="tnum font-semibold text-foreground">{count}</strong>{' '}
          {count === 1 ? 'page' : 'pages'}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          aria-hidden="true"
          className={`flex-none text-muted-foreground transition-transform duration-150 ease-out ${
            open ? 'rotate-90' : ''
          }`}
        >
          <path d="M5 3l4 4-4 4" />
        </svg>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 bg-background px-6 pt-1 pb-4 pl-30">
          <p className="text-xs text-muted-foreground">{rule.description}</p>
          {issues.isPending ? (
            <p className="text-xs text-muted-foreground">Loading pages…</p>
          ) : issues.isError ? (
            <p className="text-xs text-destructive">Could not load pages.</p>
          ) : (
            <>
              <ul className="flex flex-col">
                {issues.data.items.map((issue) => (
                  <li
                    key={issue.id}
                    className="flex justify-between gap-6 border-b border-dashed border-border py-1.5 font-mono text-xs"
                  >
                    <span title={issue.page.url} className="min-w-0 flex-none truncate">
                      {issue.page.path}
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground" title={issue.message}>
                      {issue.message}
                    </span>
                  </li>
                ))}
              </ul>
              {issues.data.total > ISSUE_PAGE_SIZE ? (
                <div className="flex items-center gap-2">
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
                  <span className="text-xs text-muted-foreground">
                    {offset + 1}–{Math.min(offset + ISSUE_PAGE_SIZE, issues.data.total)} of{' '}
                    {issues.data.total}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
