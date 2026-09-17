import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScoreBadge } from './score-badge';
import { ScoreDelta } from './score-delta';

afterEach(cleanup);

describe('ScoreBadge', () => {
  it('always pairs the band colour with its word', () => {
    render(<ScoreBadge score={92} />);
    expect(screen.getByText('92 · Good')).toBeInTheDocument();
  });

  it('shows a dash when there is no score', () => {
    render(<ScoreBadge score={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('ScoreDelta', () => {
  it('signs the change with an arrow', () => {
    render(
      <>
        <ScoreDelta delta={5} />
        <ScoreDelta delta={-12} />
        <ScoreDelta delta={0} />
      </>,
    );
    expect(screen.getByText('▲ +5')).toBeInTheDocument();
    expect(screen.getByText('▼ −12')).toBeInTheDocument();
    expect(screen.getByText('±0')).toBeInTheDocument();
  });
});
