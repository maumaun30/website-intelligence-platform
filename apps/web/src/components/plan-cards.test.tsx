import { PLAN_LIMITS } from '@wintel/types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanCards } from './plan-cards';

const usage = { websites: 3, aiExplanationsThisMonth: 12 };

afterEach(cleanup);

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

  it('asks for confirmation, naming the websites that lose their schedule, before switching', () => {
    const onSelect = vi.fn();
    render(
      <PlanCards
        current="pro"
        plans={PLAN_LIMITS}
        usage={usage}
        websites={[
          { id: 'w1', name: 'Alpha', scanFrequency: 'daily' },
          { id: 'w2', name: 'Beta', scanFrequency: 'manual' },
        ]}
        onSelect={onSelect}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch to free/i }));

    expect(onSelect).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: /switch to free/i });
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByText('Alpha')).toBeInTheDocument();
    expect(within(dialog).queryByText('Beta')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }));

    expect(onSelect).toHaveBeenCalledWith('free');
  });

  it('switches nothing when the confirmation is cancelled', () => {
    const onSelect = vi.fn();
    render(
      <PlanCards
        current="pro"
        plans={PLAN_LIMITS}
        usage={usage}
        websites={[{ id: 'w1', name: 'Alpha', scanFrequency: 'daily' }]}
        onSelect={onSelect}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch to agency/i }));
    const dialog = screen.getByRole('alertdialog', { name: /switch to agency/i });
    expect(within(dialog).getByText(/no scheduled scans change/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
