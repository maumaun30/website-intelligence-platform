import { PLAN_LIMITS } from '@wintel/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanCards } from './plan-cards';

afterEach(cleanup);

describe('PlanCards', () => {
  it('marks the current plan and offers to subscribe to the others', () => {
    render(
      <PlanCards
        current="pro"
        plans={PLAN_LIMITS}
        hasSubscription={false}
        onSubscribe={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByText('Current plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subscribe to agency/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /subscribe to free/i })).not.toBeInTheDocument();
  });

  it('calls onSubscribe with the plan when a subscribe button is clicked', () => {
    const onSubscribe = vi.fn();
    render(
      <PlanCards
        current="free"
        plans={PLAN_LIMITS}
        hasSubscription={false}
        onSubscribe={onSubscribe}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /subscribe to pro/i }));

    expect(onSubscribe).toHaveBeenCalledWith('pro');
  });

  it('renders no subscribe buttons once a subscription already exists', () => {
    render(
      <PlanCards
        current="pro"
        plans={PLAN_LIMITS}
        hasSubscription
        onSubscribe={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.queryByRole('button', { name: /subscribe to/i })).not.toBeInTheDocument();
  });
});
