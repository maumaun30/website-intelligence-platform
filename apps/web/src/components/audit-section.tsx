'use client';

import {
  AUDIT_RULES,
  type AuditRuleId,
  type AuditStatus,
  ISSUE_SEVERITIES,
  type IssueSeverity,
} from '@wintel/types';
import { Badge, Button } from '@wintel/ui';
import { useState } from 'react';

import { AiExplanation } from '@/components/ai-explanation';
import { AuditChanges } from '@/components/audit-changes';
import { AuditRuleGroup } from '@/components/audit-rule-group';
import { isActiveAudit, useAudit, useRerunAudit } from '@/lib/use-audits';

const STATUS_VARIANT: Record<AuditStatus, 'default' | 'success' | 'destructive' | 'outline'> = {
  queued: 'outline',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
};

const RULE_COUNT = Object.keys(AUDIT_RULES).length;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The audit of one completed scan: status, severity counts, and issues grouped by rule. */
export function AuditSection({ scanId }: { scanId: string }) {
  const { data: audit, isPending, isError } = useAudit(scanId);
  const rerun = useRerunAudit(scanId);
  const [filter, setFilter] = useState<IssueSeverity | 'all'>('all');
  const [openRuleId, setOpenRuleId] = useState<AuditRuleId | null>(null);
  const active = isActiveAudit(audit);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading audit…</p>;
  }

  if (isError) {
    return <p className="text-sm text-destructive">Could not load the audit.</p>;
  }

  const groups = [...(audit?.ruleCounts ?? [])].sort(
    (a, b) =>
      ISSUE_SEVERITIES.indexOf(a.severity) - ISSUE_SEVERITIES.indexOf(b.severity) ||
      b.count - a.count ||
      AUDIT_RULES[a.ruleId].title.localeCompare(AUDIT_RULES[b.ruleId].title),
  );
  const shown = filter === 'all' ? groups : groups.filter((group) => group.severity === filter);
  const totalIssues = audit ? audit.criticalCount + audit.warningCount + audit.noticeCount : 0;
  const counts: Record<IssueSeverity | 'all', number> = {
    all: totalIssues,
    critical: audit?.criticalCount ?? 0,
    warning: audit?.warningCount ?? 0,
    notice: audit?.noticeCount ?? 0,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold">Audit</h3>
          {audit ? <Badge variant={STATUS_VARIANT[audit.status]}>{audit.status}</Badge> : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => rerun.mutate()}
          disabled={active || rerun.isPending}
        >
          {active ? 'Auditing…' : audit ? 'Re-run audit' : 'Run audit'}
        </Button>
      </div>

      {rerun.error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not start the audit.
        </p>
      ) : null}

      {audit === null ? <p className="text-sm text-muted-foreground">No audit yet.</p> : null}

      {audit?.status === 'failed' && audit.error !== null ? (
        <p className="text-xs text-destructive">{audit.error}</p>
      ) : null}

      {audit?.status === 'completed' ? (
        <>
          <p className="text-sm">
            {`${audit.criticalCount} critical · ${plural(audit.warningCount, 'warning')} · ${plural(audit.noticeCount, 'notice')}`}
          </p>
          <AuditChanges scanId={scanId} audit={audit} />
          {totalIssues === 0 ? (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-6">
              <span className="text-[15px] font-semibold">All {RULE_COUNT} rules pass</span>
              <p className="text-sm text-muted-foreground">No issues found.</p>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
                  <h4 className="text-[15px] font-semibold">
                    Issues by rule{' '}
                    <span className="text-[13px] font-medium text-muted-foreground">
                      · {RULE_COUNT} rules checked, {groups.length} failing
                    </span>
                  </h4>
                  <div
                    role="radiogroup"
                    aria-label="Filter severity"
                    className="flex gap-0.5 rounded-md bg-muted p-0.5"
                  >
                    {(['all', ...ISSUE_SEVERITIES] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={filter === option}
                        onClick={() => setFilter(option)}
                        className={`rounded-sm px-3 py-1 text-xs font-medium capitalize transition-colors ease-out ${
                          filter === option
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {option === 'all' ? 'All' : `${option} ${counts[option]}`}
                      </button>
                    ))}
                  </div>
                </div>
                {shown.length === 0 ? (
                  <p className="px-6 py-5 text-sm text-muted-foreground">
                    No {filter} issues in this audit.
                  </p>
                ) : (
                  shown.map((group) => (
                    <AuditRuleGroup
                      key={group.ruleId}
                      scanId={scanId}
                      ruleId={group.ruleId}
                      count={group.count}
                      auditUpdatedAt={audit.updatedAt}
                      open={openRuleId === group.ruleId}
                      onToggle={() =>
                        setOpenRuleId(openRuleId === group.ruleId ? null : group.ruleId)
                      }
                    />
                  ))
                )}
              </div>

              <aside
                aria-label="AI explanation"
                className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-brand-strong uppercase">
                    AI explanation
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Generated · review before applying
                  </span>
                </div>
                {openRuleId === null ? (
                  <p className="text-[13px] text-muted-foreground">
                    Open a rule to read what it means for this site and how to fix it.
                  </p>
                ) : (
                  <>
                    <h5 className="text-lg leading-snug font-semibold tracking-[-0.01em]">
                      {AUDIT_RULES[openRuleId].title}
                    </h5>
                    <AiExplanation scanId={scanId} ruleId={openRuleId} />
                  </>
                )}
              </aside>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
