import { describe, expect, it } from 'vitest';

import { buildAuditContext } from './audit-context';
import { runAudit } from './run-audit';

describe('runAudit', () => {
  it('attaches catalog severities and counts issues by severity', () => {
    const ctx = buildAuditContext([], new Map(), new Map());
    const rules = [
      {
        id: 'server-error' as const,
        evaluate: () => [
          { pageId: 'p1', ruleId: 'server-error' as const, message: 'm', evidence: {} },
        ],
      },
      {
        id: 'missing-h1' as const,
        evaluate: () => [
          { pageId: 'p1', ruleId: 'missing-h1' as const, message: 'm', evidence: {} },
          { pageId: 'p2', ruleId: 'missing-h1' as const, message: 'm', evidence: {} },
        ],
      },
    ];

    const outcome = runAudit(ctx, rules);

    expect(outcome.counts).toEqual({ critical: 1, warning: 2, notice: 0 });
    expect(outcome.issues.map((issue) => issue.severity)).toEqual([
      'critical',
      'warning',
      'warning',
    ]);
  });
});
