'use client';

import { AUDIT_RULES, type Audit, type IssueChangeKind } from '@wintel/types';
import { Button } from '@wintel/ui';
import { useState } from 'react';

import { CHANGE_PAGE_SIZE, useChanges } from '@/lib/use-insights';

function ChangeList({
  scanId,
  kind,
  total,
  auditUpdatedAt,
}: {
  scanId: string;
  kind: IssueChangeKind;
  total: number;
  auditUpdatedAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const changes = useChanges(scanId, kind, offset, auditUpdatedAt, open);

  if (total === 0) {
    return null;
  }

  return (
    <details
      className="rounded-md border border-border"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-3 py-2 text-sm">
        {kind === 'new' ? `New issues (${total})` : `Fixed issues (${total})`}
      </summary>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
          {changes.isPending ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : changes.isError ? (
            <p className="text-xs text-destructive">Could not load changes.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {changes.data.items.map((change) => (
                  <li key={change.id} className="text-xs">
                    <span className="font-medium">{change.path}</span>{' '}
                    <span className="text-muted-foreground">
                      {AUDIT_RULES[change.ruleId].title} — {change.message}
                    </span>
                  </li>
                ))}
              </ul>
              {total > CHANGE_PAGE_SIZE ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - CHANGE_PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + CHANGE_PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + CHANGE_PAGE_SIZE)}
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

/** What changed since the website's previous audit. */
export function AuditChanges({ scanId, audit }: { scanId: string; audit: Audit }) {
  if (
    audit.previousAuditId === null ||
    audit.newIssueCount === null ||
    audit.fixedIssueCount === null
  ) {
    return <p className="text-xs text-muted-foreground">First audit — nothing to compare yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{`Since previous audit: ${audit.newIssueCount} new · ${audit.fixedIssueCount} fixed`}</p>
      <ChangeList
        scanId={scanId}
        kind="new"
        total={audit.newIssueCount}
        auditUpdatedAt={audit.updatedAt}
      />
      <ChangeList
        scanId={scanId}
        kind="fixed"
        total={audit.fixedIssueCount}
        auditUpdatedAt={audit.updatedAt}
      />
    </div>
  );
}
