import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Select } from './select';

afterEach(cleanup);

describe('Select', () => {
  it('renders its options and applies extra class names', () => {
    render(
      <Select aria-label="Frequency" className="custom">
        <option value="manual">Manual</option>
        <option value="daily">Daily</option>
      </Select>,
    );

    const select = screen.getByLabelText('Frequency');

    expect(select).toBeInTheDocument();
    expect(select).toHaveClass('custom');
    expect(screen.getByRole('option', { name: 'Daily' })).toBeInTheDocument();
  });
});
