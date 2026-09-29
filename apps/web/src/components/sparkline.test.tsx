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
    const marker = container.querySelector<HTMLElement>('[data-latest="true"]');
    // The marker is an HTML dot on top of the stretched SVG, so it must stay round.
    expect(marker?.tagName).toBe('SPAN');
    // The last point sits one pad in from the right edge: (240 - 4) / 240.
    expect(marker?.style.left).toBe('98.33333333333333%');
    expect(screen.getByRole('img', { name: 'Health score' })).toBeInTheDocument();
  });

  it('exposes every value in an accessible table', () => {
    render(<Sparkline points={points} label="Health score" />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '80' })).toBeInTheDocument();
  });

  it('says a single audit is not a trend yet, rather than drawing a lone dot', () => {
    const single = render(<Sparkline points={[points[0]!]} label="Health score" />);

    expect(single.container.querySelector('polyline')).toBeNull();
    expect(single.container.querySelector('[data-latest="true"]')).toBeNull();
    expect(
      screen.getByText('First audit, on Sep 1. The trend appears after the next scan.'),
    ).toBeInTheDocument();
    // The value is still readable to a screen reader.
    expect(screen.getByRole('cell', { name: '40' })).toBeInTheDocument();
  });

  it('draws nothing at all when there are no audits', () => {
    const empty = render(<Sparkline points={[]} label="Health score" />);

    expect(empty.container).toBeEmptyDOMElement();
  });

  it('prints one date in the caption when every audit landed on the same day', () => {
    const { container } = render(
      <Sparkline
        points={[
          { label: 'Sep 1', value: 40 },
          { label: 'Sep 1', value: 55 },
        ]}
        label="Health score"
      />,
    );

    // The visually hidden table still lists both points; only the caption collapses.
    expect(container.querySelector('figcaption')?.textContent).toBe('Sep 1');
  });
});
