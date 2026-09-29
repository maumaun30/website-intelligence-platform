import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
let state = { mutate, isPending: false, isError: false, isSuccess: false };

vi.mock('@/lib/use-account', () => ({
  useChangePassword: () => state,
}));

import { PasswordForm } from './password-form';

afterEach(() => {
  cleanup();
  mutate.mockReset();
  state = { mutate, isPending: false, isError: false, isSuccess: false };
});

function fill(current: string, next: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
}

describe('PasswordForm', () => {
  it('refuses a new password shorter than the minimum, without calling the API', () => {
    render(<PasswordForm />);

    fill('old-password', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('changes the password once both fields are valid', () => {
    render(<PasswordForm />);

    fill('old-password', 'a-much-longer-password');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(mutate).toHaveBeenCalledWith(
      { currentPassword: 'old-password', newPassword: 'a-much-longer-password' },
      expect.anything(),
    );
  });

  it('warns that other sessions end', () => {
    render(<PasswordForm />);

    expect(screen.getByText(/signs out your other sessions/)).toBeInTheDocument();
  });
});
