import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Scan, Website } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const startMutate = vi.fn();
let scans: Scan[] = [];

vi.mock('@/lib/use-scans', () => ({
  SCAN_PAGE_SIZE: 50,
  isActiveScan: (scan: Scan | undefined) => scan?.status === 'queued' || scan?.status === 'running',
  useScans: () => ({ data: scans, isPending: false, isError: false }),
  useStartScan: () => ({ mutate: startMutate, isPending: false, error: null }),
  useScanPages: () => ({
    data: { items: [], total: 0, limit: 50, offset: 0 },
    isPending: false,
    isError: false,
  }),
}));

import { ScanPanel } from './scan-panel';

const website = { id: 'w1', name: 'Acme', verificationStatus: 'verified' } as Website;

function scan(overrides: Partial<Scan>): Scan {
  return {
    id: 's1',
    websiteId: 'w1',
    organizationId: 'o1',
    status: 'completed',
    stopReason: 'finished',
    startedAt: '2026-09-17T00:00:00.000Z',
    finishedAt: '2026-09-17T00:01:00.000Z',
    pagesCrawled: 42,
    pagesFailed: 2,
    error: null,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:01:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  startMutate.mockReset();
  scans = [];
});

describe('ScanPanel', () => {
  it('starts a scan of a verified website', () => {
    render(<ScanPanel website={website} />);

    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    expect(startMutate).toHaveBeenCalled();
    expect(screen.getByText('No scans yet.')).toBeInTheDocument();
  });

  it('disables scanning until the website is verified', () => {
    render(<ScanPanel website={{ ...website, verificationStatus: 'pending' }} />);

    expect(screen.getByRole('button', { name: 'Scan' })).toBeDisabled();
    expect(screen.getByText('Verify ownership to enable scanning.')).toBeInTheDocument();
  });

  it('shows live progress and blocks a second scan while one runs', () => {
    scans = [
      scan({
        status: 'running',
        stopReason: null,
        finishedAt: null,
        pagesCrawled: 7,
        pagesFailed: 1,
      }),
    ];

    render(<ScanPanel website={website} />);

    expect(screen.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('7 pages crawled · 1 failed')).toBeInTheDocument();
  });

  it('explains why a completed scan stopped', () => {
    scans = [scan({ stopReason: 'maxPages' })];

    render(<ScanPanel website={website} />);

    expect(screen.getByText('Stopped at the page limit.')).toBeInTheDocument();
  });

  it('shows the error of a failed scan', () => {
    scans = [
      scan({ status: 'failed', stopReason: null, error: 'Could not reach https://acme.test/' }),
    ];

    render(<ScanPanel website={website} />);

    expect(screen.getByText('Could not reach https://acme.test/')).toBeInTheDocument();
  });
});
