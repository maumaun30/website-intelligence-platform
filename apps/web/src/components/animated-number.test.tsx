import { act, cleanup, render, screen } from '@testing-library/react';
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

  it('counts through intermediate values and lands exactly on the new one', () => {
    // Frames are driven by hand: waiting on real ones makes the test a race with the machine.
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('performance', { now: () => now });

    const { rerender } = render(<AnimatedNumber value={40} />);
    rerender(<AnimatedNumber value={90} />);

    // Half way through the 600ms it is somewhere between the two, not at either end.
    now = 300;
    act(() => frames.shift()!(now));
    const midway = Number(screen.getByText(/\d+/).textContent);
    expect(midway).toBeGreaterThan(40);
    expect(midway).toBeLessThan(90);

    // Past the end it sits exactly on the new value — never 89 from a rounding error.
    now = 700;
    act(() => frames.shift()!(now));
    expect(screen.getByText('90')).toBeInTheDocument();
  });
});
