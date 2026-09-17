import { describe, expect, it } from 'vitest';

import { AUDIT_RULE_IDS, AUDIT_RULES, issueListQuerySchema } from './audit';
import { scanAuditJobSchema } from './audit-jobs';

describe('AUDIT_RULES', () => {
  it('describes exactly the rule ids, with the spec severities', () => {
    expect(Object.keys(AUDIT_RULES).sort()).toEqual([...AUDIT_RULE_IDS].sort());
    expect(AUDIT_RULE_IDS).toHaveLength(15);
    expect(AUDIT_RULES['broken-internal-link'].severity).toBe('critical');
    expect(AUDIT_RULES['server-error'].severity).toBe('critical');
    expect(AUDIT_RULES['duplicate-title'].severity).toBe('warning');
    expect(AUDIT_RULES['noindex'].severity).toBe('notice');
  });
});

describe('issueListQuerySchema', () => {
  it('coerces pagination and accepts optional filters', () => {
    expect(issueListQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(
      issueListQuerySchema.parse({ severity: 'critical', ruleId: 'missing-h1', limit: '5' }),
    ).toEqual({ severity: 'critical', ruleId: 'missing-h1', limit: 5, offset: 0 });
  });

  it('rejects unknown rules and severities', () => {
    expect(issueListQuerySchema.safeParse({ ruleId: 'nope' }).success).toBe(false);
    expect(issueListQuerySchema.safeParse({ severity: 'fatal' }).success).toBe(false);
  });
});

describe('scanAuditJobSchema', () => {
  it('requires both ids', () => {
    expect(scanAuditJobSchema.safeParse({ auditId: 'a', scanId: 's' }).success).toBe(true);
    expect(scanAuditJobSchema.safeParse({ auditId: 'a' }).success).toBe(false);
  });
});
