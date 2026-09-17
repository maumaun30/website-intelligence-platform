import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Audit } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rerunMutate = vi.fn();
let audit: Audit | null = null;

vi.mock('@/lib/use-audits', () => ({
  ISSUE_PAGE_SIZE: 20,
  isActiveAudit: (value: Audit | null) => value?.status === 'queued' || value?.status === 'running',
  useAudit: () => ({ data: audit, isPending: false, isError: false }),
  useRerunAudit: () => ({ mutate: rerunMutate, isPending: false, error: null }),
  useRuleIssues: () => ({ data: undefined, isPending: true, isError: false }),
}));

vi.mock('@/components/audit-changes', () => ({ AuditChanges: () => null }));

import { AuditSection } from './audit-section';

function makeAudit(overrides: Partial<Audit>): Audit {
  return {
    id: 'a1',
    scanId: 's1',
    organizationId: 'o1',
    status: 'completed',
    criticalCount: 1,
    warningCount: 3,
    noticeCount: 0,
    score: null,
    scoreDelta: null,
    newIssueCount: null,
    fixedIssueCount: null,
    previousAuditId: null,
    startedAt: '2026-09-17T00:00:00.000Z',
    finishedAt: '2026-09-17T00:00:01.000Z',
    error: null,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:01.000Z',
    ruleCounts: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  rerunMutate.mockReset();
  audit = null;
});

describe('AuditSection', () => {
  it('offers to run an audit when none exists', () => {
    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('No audit yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run audit' }));
    expect(rerunMutate).toHaveBeenCalled();
  });

  it('shows progress while auditing', () => {
    audit = makeAudit({ status: 'running' });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByRole('button', { name: 'Auditing…' })).toBeDisabled();
  });

  it('shows severity counts and rules grouped most severe first', () => {
    audit = makeAudit({
      ruleCounts: [
        { ruleId: 'missing-h1', severity: 'warning', count: 2 },
        { ruleId: 'broken-internal-link', severity: 'critical', count: 1 },
        { ruleId: 'client-error', severity: 'warning', count: 1 },
      ],
    });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('1 critical · 3 warnings · 0 notices')).toBeInTheDocument();
    const titles = screen.getAllByTestId('audit-rule-title').map((element) => element.textContent);
    expect(titles).toEqual(['Broken internal link', 'Missing H1', 'Page not found or forbidden']);
    expect(screen.getByRole('button', { name: 'Re-run audit' })).toBeEnabled();
  });

  it('says so when a completed audit found nothing', () => {
    audit = makeAudit({ criticalCount: 0, warningCount: 0 });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('No issues found.')).toBeInTheDocument();
  });

  it('shows why an audit failed', () => {
    audit = makeAudit({ status: 'failed', error: 'loader exploded' });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('loader exploded')).toBeInTheDocument();
  });
});
