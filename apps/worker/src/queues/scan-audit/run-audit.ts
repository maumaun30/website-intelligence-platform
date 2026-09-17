import { AUDIT_RULES, type IssueSeverity } from '@wintel/types';

import type { AuditContext, AuditRuleImplementation, IssueDraft } from './audit-context';
import { AUDIT_RULE_IMPLEMENTATIONS } from './rules';

export interface AuditOutcome {
  issues: Array<IssueDraft & { severity: IssueSeverity }>;
  counts: Record<IssueSeverity, number>;
}

/** Runs every rule over the context. Pure: no I/O, so the whole engine is testable in memory. */
export function runAudit(
  ctx: AuditContext,
  rules: readonly AuditRuleImplementation[] = AUDIT_RULE_IMPLEMENTATIONS,
): AuditOutcome {
  const counts: Record<IssueSeverity, number> = { critical: 0, warning: 0, notice: 0 };
  const issues = rules.flatMap((rule) =>
    rule.evaluate(ctx).map((draft) => {
      const severity = AUDIT_RULES[draft.ruleId].severity;
      counts[severity]++;
      return { ...draft, severity };
    }),
  );
  return { issues, counts };
}
