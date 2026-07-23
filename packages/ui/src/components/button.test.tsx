import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders its children inside a button element', () => {
    render(<Button>Run scan</Button>);

    expect(screen.getByRole('button', { name: 'Run scan' })).toBeInTheDocument();
  });

  it('merges a caller-supplied class name with the variant classes', () => {
    render(<Button className="w-full">Run scan</Button>);

    expect(screen.getByRole('button')).toHaveClass('w-full');
  });

  it('renders as the child element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/scans">View scans</a>
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'View scans' })).toBeInTheDocument();
  });

  it('forwards the disabled attribute', () => {
    render(<Button disabled>Run scan</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
