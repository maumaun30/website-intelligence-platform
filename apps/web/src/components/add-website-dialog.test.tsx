import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
const replace = vi.fn();
let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/use-websites', () => ({
  useCreateWebsite: () => ({ mutate, isPending: false, error: null }),
}));

import { AddWebsiteDialog } from './add-website-dialog';

afterEach(() => {
  cleanup();
  mutate.mockReset();
  replace.mockReset();
  params = new URLSearchParams();
});

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Add website' }));
}

describe('AddWebsiteDialog', () => {
  it('keeps the form out of the way until asked for', () => {
    const { container } = render(<AddWebsiteDialog />);

    expect(container.querySelector('dialog')).not.toHaveAttribute('open');
  });

  it('opens the form from the button', () => {
    const { container } = render(<AddWebsiteDialog />);

    openDialog();

    expect(container.querySelector('dialog')).toHaveAttribute('open');
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
  });

  it('opens straight away when it was asked for by the URL', () => {
    params = new URLSearchParams('add=1');

    const { container } = render(<AddWebsiteDialog />);

    expect(container.querySelector('dialog')).toHaveAttribute('open');
  });

  it('clears ?add=1 on close, so going back does not reopen it', () => {
    params = new URLSearchParams('add=1');

    render(<AddWebsiteDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(replace).toHaveBeenCalledWith('/dashboard/websites');
  });

  it('closes once the website is created', async () => {
    const { container } = render(<AddWebsiteDialog />);
    openDialog();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://acme.test' } });
    fireEvent.submit(screen.getAllByRole('button', { name: 'Add website' })[1]!);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    // The form hands back through onSuccess; run it the way the mutation would.
    const options = mutate.mock.calls[0]![1] as { onSuccess: () => void };
    options.onSuccess();

    await waitFor(() => expect(container.querySelector('dialog')).not.toHaveAttribute('open'));
  });
});
