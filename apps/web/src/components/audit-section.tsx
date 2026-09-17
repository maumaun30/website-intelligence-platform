'use client';

import { AUDIT_RULES, type AuditStatus, ISSUE_SEVERITIES } from '@wintel/types';
import { Badge, Button } from '@wintel/ui';

import { AuditChanges } from '@/components/audit-changes';
import { AuditRuleGroup } from '@/components/audit-rule-group';
import { isActiveAudit, useAudit, useRerunAudit } from '@/lib/use-audits';

const STATUS_VARIANT: Record<AuditStatus, 'default' | 'success' | 'destructive' | 'outline'> = {
  queued: 'outline',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The audit of one completed scan: status, severity counts, and issues grouped by rule. */
export function AuditSection({ scanId }: { scanId: string }) {
  const { data: audit, isPending, isError } = useAudit(scanId);
  const rerun = useRerunAudit(scanId);
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
  const totalIssues = audit ? audit.criticalCount + audit.warningCount + audit.noticeCount : 0;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Audit</h3>
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
            <p className="text-sm text-muted-foreground">No issues found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((group) => (
                <AuditRuleGroup
                  key={group.ruleId}
                  scanId={scanId}
                  ruleId={group.ruleId}
                  count={group.count}
                  auditUpdatedAt={audit.updatedAt}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
