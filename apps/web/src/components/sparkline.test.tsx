import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Sparkline } from './sparkline';

afterEach(cleanup);

const points = [
  { label: 'Sep 1', value: 40 },
  { label: 'Sep 2', value: 60 },
  { label: 'Sep 3', value: 80 },
];

describe('Sparkline', () => {
  it('draws one line through every point and marks the latest', () => {
    const { container } = render(<Sparkline points={points} label="Health score" />);

    const line = container.querySelector('polyline');
    expect(line?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(3);
    expect(container.querySelectorAll('[data-latest="true"]')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Health score' })).toBeInTheDocument();
  });

  it('exposes every value in an accessible table', () => {
    render(<Sparkline points={points} label="Health score" />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '80' })).toBeInTheDocument();
  });

  it('draws a lone marker for a single point and nothing for none', () => {
    const single = render(<Sparkline points={[points[0]!]} label="Health score" />);
    expect(single.container.querySelector('polyline')).toBeNull();
    expect(single.container.querySelectorAll('circle[data-latest="true"]')).toHaveLength(1);
    single.unmount();

    const empty = render(<Sparkline points={[]} label="Health score" />);
    expect(empty.container.querySelector('svg')).toBeNull();
  });
});
