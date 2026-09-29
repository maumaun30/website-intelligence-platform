import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Website } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
const reset = vi.fn();
const push = vi.fn();
let state = { mutate, reset, isPending: false, isError: false };

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/use-websites', () => ({ useDeleteWebsite: () => state }));

import { DeleteWebsiteDialog } from './delete-website-dialog';

const website = { id: 'w1', name: 'Demo shop', domain: 'demo.test' } as Website;

afterEach(() => {
  cleanup();
  mutate.mockReset();
  reset.mockReset();
  push.mockReset();
  state = { mutate, reset, isPending: false, isError: false };
});

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete website' }));
}

function confirmButton(): HTMLElement {
  return screen.getAllByRole('button', { name: 'Delete website' })[1]!;
}

describe('DeleteWebsiteDialog', () => {
  it('spells out what else gets deleted', () => {
    render(<DeleteWebsiteDialog website={website} />);
    open();

    expect(screen.getByText('Delete Demo shop?')).toBeInTheDocument();
    expect(screen.getByText(/audits, issue history and AI explanations/)).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('refuses to delete until the domain is typed exactly', () => {
    render(<DeleteWebsiteDialog website={website} />);
    open();

    expect(confirmButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'demo' } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'demo.test' } });
    expect(confirmButton()).toBeEnabled();
  });

  it('deletes the website and leaves the page it was on', async () => {
    render(<DeleteWebsiteDialog website={website} />);
    open();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'demo.test' } });
    fireEvent.click(confirmButton());

    expect(mutate).toHaveBeenCalledWith('w1', expect.anything());

    const options = mutate.mock.calls[0]![1] as { onSuccess: () => void };
    options.onSuccess();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/websites'));
  });

  it('keeping it closes the dialog and clears what was typed', () => {
    const { container } = render(<DeleteWebsiteDialog website={website} />);
    open();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'demo.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(container.querySelector('dialog')).not.toHaveAttribute('open');
    expect(mutate).not.toHaveBeenCalled();

    open();
    expect(screen.getByLabelText(/to confirm/)).toHaveValue('');
  });

  it('reports a failed delete instead of pretending it worked', () => {
    state = { ...state, isError: true };

    render(<DeleteWebsiteDialog website={website} />);
    open();

    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete this website.');
  });
});
