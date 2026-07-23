import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './input';
import { Label } from './label';

describe('Input', () => {
  it('renders an input and forwards props', () => {
    render(<Input placeholder="Email" type="email" />);

    const input = screen.getByPlaceholderText('Email');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
  });

  it('merges a caller-supplied class name', () => {
    render(<Input placeholder="Email" className="w-64" />);

    expect(screen.getByPlaceholderText('Email')).toHaveClass('w-64');
  });
});

describe('Label', () => {
  it('associates with a control via htmlFor', () => {
    render(<Label htmlFor="email">Email</Label>);

    expect(screen.getByText('Email')).toHaveAttribute('for', 'email');
  });
});
