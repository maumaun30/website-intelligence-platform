import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScoreBadge } from './score-badge';
import { ScoreDelta } from './score-delta';

afterEach(cleanup);

describe('ScoreBadge', () => {
  it('always pairs the band colour with its word', () => {
    render(<ScoreBadge score={92} />);
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('says so when there is no score', () => {
    render(<ScoreBadge score={null} />);
    expect(screen.getByText('Not scored yet')).toBeInTheDocument();
  });
});

describe('ScoreDelta', () => {
  it('signs the change with an arrow and states it in words', () => {
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
    expect(screen.getByLabelText('Up 5 points')).toBeInTheDocument();
    expect(screen.getByLabelText('Down 12 points')).toBeInTheDocument();
  });
});
