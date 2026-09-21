import { PLAN_LIMITS } from '@wintel/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanCards } from './plan-cards';

const usage = { websites: 3, aiExplanationsThisMonth: 12 };

describe('PlanCards', () => {
  it('marks the current plan and offers the others', () => {
    render(
      <PlanCards
        current="pro"
        plans={PLAN_LIMITS}
        usage={usage}
        onSelect={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByText('Current plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to free/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to agency/i })).toBeInTheDocument();
  });

  it('names the websites that lose their schedule when downgrading', () => {
    render(
      <PlanCards
        current="pro"
        plans={PLAN_LIMITS}
        usage={usage}
        websites={[
          { id: 'w1', name: 'Alpha', scanFrequency: 'daily' },
          { id: 'w2', name: 'Beta', scanFrequency: 'manual' },
        ]}
        onSelect={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByText(/Alpha/)).toBeInTheDocument();
    expect(screen.queryByText(/Beta/)).not.toBeInTheDocument();
  });
});
