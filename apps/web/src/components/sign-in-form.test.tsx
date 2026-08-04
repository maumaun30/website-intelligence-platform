import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const signInEmail = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/auth-client', () => ({
  signIn: {
    email: (...args: unknown[]) => signInEmail(...args),
  },
}));

import { SignInForm } from './sign-in-form';

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

describe('SignInForm', () => {
  beforeEach(() => {
    push.mockReset();
    signInEmail.mockReset();
  });

  it('shows a validation error and does not call the API for invalid input', async () => {
    render(<SignInForm />);
    fill('not-an-email', 'secret123');
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('valid email');
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('calls the API and redirects to the dashboard on success', async () => {
    signInEmail.mockResolvedValue({ error: null });
    render(<SignInForm />);
    fill('user@example.com', 'secret123');
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(signInEmail).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret123',
    });
  });

  it('surfaces the API error and stays on the page', async () => {
    signInEmail.mockResolvedValue({ error: { message: 'Invalid credentials' } });
    render(<SignInForm />);
    fill('user@example.com', 'secret123');
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(push).not.toHaveBeenCalled();
  });
});
