import { cleanup, render, screen } from '@testing-library/react';
import type { Audit } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/use-insights', () => ({
  CHANGE_PAGE_SIZE: 20,
  useChanges: () => ({ data: undefined, isPending: true, isError: false }),
}));

import { AuditChanges } from './audit-changes';

const base = {
  id: 'a1',
  updatedAt: '2026-09-17T00:00:00.000Z',
  previousAuditId: 'a0',
  newIssueCount: 3,
  fixedIssueCount: 5,
} as Audit;

afterEach(cleanup);

describe('AuditChanges', () => {
  it('summarises new and fixed issues since the previous audit', () => {
    render(<AuditChanges scanId="s1" audit={base} />);

    expect(screen.getByText('Since previous audit: 3 new · 5 fixed')).toBeInTheDocument();
  });

  it('explains when there is nothing to compare yet', () => {
    render(
      <AuditChanges
        scanId="s1"
        audit={{ ...base, previousAuditId: null, newIssueCount: null, fixedIssueCount: null }}
      />,
    );

    expect(screen.getByText('First audit — nothing to compare yet.')).toBeInTheDocument();
  });
});
