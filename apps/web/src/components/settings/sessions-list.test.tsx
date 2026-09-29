import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const revoke = vi.fn();
const revokeOthers = vi.fn();
let sessions: unknown[] = [];

vi.mock('@/lib/use-account', () => ({
  useSessions: () => ({ data: sessions, isPending: false, isError: false }),
  useRevokeSession: () => ({ mutate: revoke, isPending: false, isError: false }),
  useRevokeOtherSessions: () => ({ mutate: revokeOthers, isPending: false, isError: false }),
}));

import { SessionsList } from './sessions-list';

function session(overrides: Record<string, unknown>) {
  return {
    id: 's1',
    token: 'token-1',
    userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
    ipAddress: '127.0.0.1',
    expiresAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  revoke.mockReset();
  revokeOthers.mockReset();
  sessions = [];
});

describe('SessionsList', () => {
  it('marks the session you are using and does not offer to end it', () => {
    sessions = [session({})];

    render(<SessionsList currentSessionToken="token-1" />);

    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('ends another session by its token', () => {
    sessions = [session({}), session({ id: 's2', token: 'token-2', userAgent: 'Firefox Windows' })];

    render(<SessionsList currentSessionToken="token-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(revoke).toHaveBeenCalledWith('token-2');
  });

  it('offers to end every other session at once', () => {
    sessions = [
      session({}),
      session({ id: 's2', token: 'token-2' }),
      session({ id: 's3', token: 'token-3' }),
    ];

    render(<SessionsList currentSessionToken="token-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out all 2 other sessions' }));

    expect(revokeOthers).toHaveBeenCalled();
  });

  it('renders dates in UTC, not the viewer zone', () => {
    sessions = [session({})];

    render(<SessionsList currentSessionToken="token-1" />);

    expect(screen.getByText(/Oct 1, 2026, 12:00 AM UTC/)).toBeInTheDocument();
  });
});
