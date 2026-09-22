import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Website } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
let updateError: { code: string | null } | null = null;

vi.mock('@/lib/use-websites', () => ({
  useUpdateWebsite: () => ({ mutate, isPending: false, error: updateError }),
}));

vi.mock('@/lib/use-billing', () => ({
  useBilling: () => ({
    data: {
      plan: 'free',
      limits: {
        websites: 1,
        pagesPerScan: 100,
        scanFrequencies: ['manual'],
        aiExplanationsPerMonth: 0,
      },
    },
  }),
}));

import { ScanConfigForm } from './scan-config-form';

const website: Website = {
  id: 'w1',
  organizationId: 'o1',
  createdById: 'u1',
  name: 'Acme',
  url: 'https://acme.test',
  domain: 'acme.test',
  verificationStatus: 'verified',
  verificationMethod: null,
  verificationToken: 'tok',
  verifiedAt: null,
  maxDepth: 3,
  maxPages: 500,
  includePaths: [],
  excludePaths: [],
  // Grandfathered: the free plan (mocked above) only allows 'manual', but this website was
  // scheduled before the org downgraded, and must remain saveable unchanged.
  scanFrequency: 'daily',
  respectRobotsTxt: true,
  nextScanAt: '2026-09-18T00:00:00.000Z',
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ScanConfigForm website={website} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mutate.mockReset();
  updateError = null;
});

describe('ScanConfigForm', () => {
  it('submits a grandfathered disallowed frequency unchanged', () => {
    renderForm();

    const select = screen.getByLabelText('Frequency') as HTMLSelectElement;
    expect(select.value).toBe('daily');
    // The website's own current value must stay selectable even though the plan disallows it.
    expect((screen.getByRole('option', { name: 'daily' }) as HTMLOptionElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole('option', { name: 'weekly' }) as HTMLOptionElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save scan config' }));

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ scanFrequency: 'daily' }));
  });

  it('renders a mapped message and a billing link when the save is refused', () => {
    updateError = { code: 'PLAN_SCAN_FREQUENCY' };
    renderForm();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('That schedule is not part of your plan.');
    expect(within(alert).getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    );
  });
});
