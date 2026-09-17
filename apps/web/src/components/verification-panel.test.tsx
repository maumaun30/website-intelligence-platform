import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Website } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const verifyMutate = vi.fn();
vi.mock('@/lib/use-websites', () => ({
  useVerifyWebsite: () => ({ mutate: verifyMutate, isPending: false }),
}));

import { VerificationPanel } from './verification-panel';

const website: Website = {
  id: 'w1',
  organizationId: 'o1',
  createdById: 'u1',
  name: 'Acme',
  url: 'https://acme.test',
  domain: 'acme.test',
  verificationStatus: 'pending',
  verificationMethod: null,
  verificationToken: 'tok-123',
  verifiedAt: null,
  maxDepth: 3,
  maxPages: 500,
  includePaths: [],
  excludePaths: [],
  scanFrequency: 'manual',
  respectRobotsTxt: true,
  nextScanAt: null,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  verifyMutate.mockReset();
});

describe('VerificationPanel', () => {
  it('shows the token for the selected method', () => {
    render(<VerificationPanel website={website} />);

    expect(screen.getByText(/wintel-verify=tok-123/)).toBeInTheDocument();
  });

  it('triggers verification with the selected method', () => {
    render(<VerificationPanel website={website} />);

    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(verifyMutate).toHaveBeenCalledWith('dns');
  });

  it('shows the verified state without a verify button', () => {
    render(<VerificationPanel website={{ ...website, verificationStatus: 'verified' }} />);

    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
  });
});
