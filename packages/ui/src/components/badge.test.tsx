import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>up</Badge>);

    expect(screen.getByText('up')).toBeInTheDocument();
  });

  it('applies a distinct class for the destructive variant', () => {
    const { rerender } = render(<Badge variant="success">up</Badge>);
    const successClass = screen.getByText('up').className;

    rerender(<Badge variant="destructive">down</Badge>);
    const destructiveClass = screen.getByText('down').className;

    expect(successClass).not.toBe(destructiveClass);
  });
});
