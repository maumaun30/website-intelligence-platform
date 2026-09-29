import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog } from './dialog';

afterEach(cleanup);

function renderDialog(open: boolean, onClose = vi.fn()) {
  const result = render(
    <Dialog open={open} onClose={onClose} title="Add a website" description="We verify it first.">
      <p>Body</p>
    </Dialog>,
  );
  return { ...result, onClose };
}

describe('Dialog', () => {
  it('opens with its title, description and content, and names itself for assistive tech', () => {
    const { container } = renderDialog(true);

    const dialog = container.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('Add a website')).toBeInTheDocument();
    expect(screen.getByText('We verify it first.')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(dialog.getAttribute('aria-labelledby')).toBe('dialog-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('dialog-description');
  });

  it('stays shut when it is not open', () => {
    const { container } = renderDialog(false);

    expect(container.querySelector('dialog')).not.toHaveAttribute('open');
  });

  it('closes from the close button', () => {
    const { onClose } = renderDialog(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a backdrop click, but not on a click inside the content', () => {
    const { container, onClose } = renderDialog(true);
    const dialog = container.querySelector('dialog')!;

    fireEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without letting the browser close it behind React s back', () => {
    const { container, onClose } = renderDialog(true);

    fireEvent(
      container.querySelector('dialog')!,
      new Event('cancel', { bubbles: false, cancelable: true }),
    );

    expect(onClose).toHaveBeenCalled();
  });
});
