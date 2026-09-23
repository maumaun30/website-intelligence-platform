import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SubscriptionBanner } from './subscription-banner';

describe('SubscriptionBanner', () => {
  it('renders nothing for a healthy subscription', () => {
    const { container } = render(
      <SubscriptionBanner
        subscription={{ status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false }}
        onManage={vi.fn()}
        pending={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('warns about a failed payment without claiming the plan is gone', () => {
    render(
      <SubscriptionBanner
        subscription={{ status: 'past_due', currentPeriodEnd: null, cancelAtPeriodEnd: false }}
        onManage={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/payment/i);
    expect(screen.getByRole('button', { name: /update payment/i })).toBeInTheDocument();
  });

  it('says when a cancelled plan runs until', () => {
    render(
      <SubscriptionBanner
        subscription={{
          status: 'active',
          currentPeriodEnd: '2026-03-12T00:00:00.000Z',
          cancelAtPeriodEnd: true,
        }}
        onManage={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/12 March 2026/);
  });
});
