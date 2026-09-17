import { cleanup, render, screen } from '@testing-library/react';
import type { OverviewRow } from '@wintel/types';
import { afterEach, describe, expect, it } from 'vitest';

import { OverviewTable } from './overview-table';

afterEach(cleanup);

function row(overrides: Partial<OverviewRow>): OverviewRow {
  return {
    websiteId: 'w1',
    name: 'Acme',
    domain: 'acme.test',
    verificationStatus: 'verified',
    scanFrequency: 'daily',
    nextScanAt: null,
    score: 72,
    scoreDelta: -3,
    criticalCount: 2,
    auditedAt: '2026-09-17T00:00:00.000Z',
    lastScan: {
      id: 's1',
      status: 'completed',
      trigger: 'scheduled',
      createdAt: '2026-09-17T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('OverviewTable', () => {
  it('lists websites in the given order, linking to each', () => {
    render(
      <OverviewTable
        rows={[
          row({ websiteId: 'bad', name: 'Bad' }),
          row({ websiteId: 'ok', name: 'Ok', score: 95 }),
        ]}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Bad', 'Ok']);
    expect(links[0]!.getAttribute('href')).toBe('/dashboard/websites/bad');
  });

  it('invites adding a website when there are none', () => {
    render(<OverviewTable rows={[]} />);

    expect(screen.getByRole('link', { name: 'Add your first website' })).toHaveAttribute(
      'href',
      '/dashboard/websites',
    );
  });

  it('marks websites that have not been audited yet', () => {
    render(
      <OverviewTable
        rows={[
          row({
            score: null,
            scoreDelta: null,
            criticalCount: null,
            auditedAt: null,
            lastScan: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
  });
});
