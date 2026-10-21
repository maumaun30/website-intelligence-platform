import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendVerificationEmail = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args),
  verifiedCallbackURL: () => 'http://localhost:3000/sign-in?verified=1',
}));

import { ResendVerificationButton } from './resend-verification-button';

/** Clicks and lets the (already resolved) send settle, without polling against a fake clock. */
async function clickResend() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
  });
}

describe('ResendVerificationButton', () => {
  beforeEach(() => {
    sendVerificationEmail.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a new link that lands back on this app, then holds off repeat clicks', async () => {
    sendVerificationEmail.mockResolvedValue({ error: null });
    render(<ResendVerificationButton email="ada@wintel.test" />);

    await clickResend();

    expect(screen.getByRole('status')).toHaveTextContent('New link sent');
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'ada@wintel.test',
      callbackURL: 'http://localhost:3000/sign-in?verified=1',
    });
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent('Resend in 60s');
  });

  it('allows another send once the cooldown runs out', async () => {
    sendVerificationEmail.mockResolvedValue({ error: null });
    render(<ResendVerificationButton email="ada@wintel.test" />);

    await clickResend();
    expect(screen.getByRole('status')).toBeInTheDocument();

    // The countdown schedules its next tick after each render, so step through it a second at a time.
    for (let second = 0; second < 60; second += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
    }

    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled();
  });

  it('surfaces a failure and lets the user try again', async () => {
    sendVerificationEmail.mockResolvedValue({ error: { message: 'Too many requests' } });
    render(<ResendVerificationButton email="ada@wintel.test" />);

    await clickResend();

    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled();
  });
});
