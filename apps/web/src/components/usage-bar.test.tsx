import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UsageBar } from './usage-bar';

afterEach(cleanup);

function meter(): HTMLElement {
  return screen.getByRole('meter');
}

describe('UsageBar', () => {
  it('states the numbers and exposes them on the meter', () => {
    render(<UsageBar label="Websites" used={3} limit={10} />);

    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(meter()).toHaveAttribute('aria-valuenow', '3');
    expect(meter()).toHaveAttribute('aria-valuemax', '10');
  });

  it('warns from 80% and turns destructive at the limit', () => {
    const under = render(<UsageBar label="Pages" used={7} limit={10} />);
    expect(meter().firstElementChild).toHaveClass('bg-primary');
    under.unmount();

    const near = render(<UsageBar label="Pages" used={8} limit={10} />);
    expect(meter().firstElementChild).toHaveClass('bg-warning');
    near.unmount();

    render(<UsageBar label="Pages" used={10} limit={10} />);
    expect(meter().firstElementChild).toHaveClass('bg-destructive');
  });

  it('keeps the label for screen readers when the card already names it', () => {
    render(<UsageBar label="AI explanations" labelHidden used={1} limit={4} />);

    expect(screen.getByText('AI explanations')).toHaveClass('sr-only');
    expect(meter()).toHaveAccessibleName('AI explanations');
  });
});
