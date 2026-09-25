import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SeverityTag } from './severity-tag';

afterEach(cleanup);

describe('SeverityTag', () => {
  it('always spells the severity out beside its colour', () => {
    render(
      <>
        <SeverityTag severity="critical" />
        <SeverityTag severity="warning" />
        <SeverityTag severity="notice" />
      </>,
    );

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Notice')).toBeInTheDocument();
  });

  it('counts the issues when given a count', () => {
    render(<SeverityTag severity="critical" count={9} />);

    expect(screen.getByText('9 critical')).toBeInTheDocument();
  });
});
