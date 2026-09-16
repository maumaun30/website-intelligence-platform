import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
vi.mock('@/lib/use-websites', () => ({
  useCreateWebsite: () => ({ mutate, isPending: false, error: null }),
}));

import { AddWebsiteForm } from './add-website-form';

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

describe('AddWebsiteForm', () => {
  it('shows a validation error and does not submit an invalid url', async () => {
    render(<AddWebsiteForm />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'not-a-url' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Add website' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('submits a valid website', async () => {
    render(<AddWebsiteForm />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://acme.test' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Add website' }));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        { name: 'Acme', url: 'https://acme.test' },
        expect.anything(),
      ),
    );
  });
});
