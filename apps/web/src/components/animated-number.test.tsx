import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimatedNumber } from './animated-number';

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => stubReducedMotion(false));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AnimatedNumber', () => {
  it('shows the real number on first render, with nothing to animate from', () => {
    render(<AnimatedNumber value={72} />);

    expect(screen.getByText('72')).toBeInTheDocument();
  });

  it('snaps straight to the new value when the viewer asked for less motion', () => {
    stubReducedMotion(true);
    const { rerender } = render(<AnimatedNumber value={40} />);

    rerender(<AnimatedNumber value={90} />);

    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('lands exactly on the new value once the animation finishes', async () => {
    const { rerender } = render(<AnimatedNumber value={40} />);

    rerender(<AnimatedNumber value={90} />);

    // Counts through intermediate values, so only the final state is asserted.
    await vi.waitFor(() => expect(screen.getByText('90')).toBeInTheDocument(), { timeout: 2000 });
  });
});
