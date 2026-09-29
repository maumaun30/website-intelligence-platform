import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the file body, so the spies have to be hoisted with them.
const { unlink, linkSocial } = vi.hoisted(() => ({ unlink: vi.fn(), linkSocial: vi.fn() }));
let providers: string[] = ['github', 'google'];
let accounts: unknown[] = [];
let accountsState = { isPending: false, isError: false };

vi.mock('@/lib/auth-client', () => ({ authClient: { linkSocial } }));
vi.mock('@/lib/use-account', () => ({
  useAuthProviders: () => ({ data: providers }),
  useLinkedAccounts: () => ({ data: accounts, ...accountsState }),
  useUnlinkAccount: () => ({ mutate: unlink, isPending: false, isError: false }),
}));

import { LinkedAccounts } from './linked-accounts';

afterEach(() => {
  cleanup();
  unlink.mockReset();
  linkSocial.mockReset();
  providers = ['github', 'google'];
  accounts = [];
  accountsState = { isPending: false, isError: false };
});

const credential = { id: 'a1', providerId: 'credential', accountId: 'u1' };
const github = { id: 'a2', providerId: 'github', accountId: 'gh-1' };

describe('LinkedAccounts', () => {
  it('says so when the deployment has no social sign-in at all', () => {
    providers = [];

    render(<LinkedAccounts />);

    expect(screen.getByText(/no social sign-in configured/)).toBeInTheDocument();
  });

  it('names a password as a way in, alongside the providers', () => {
    accounts = [credential, github];

    render(<LinkedAccounts />);

    expect(screen.getByText('Email and password')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('refuses to disconnect the only way left to sign in', () => {
    accounts = [credential];

    render(<LinkedAccounts />);

    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
    expect(screen.getByText('Your only way to sign in')).toBeInTheDocument();
  });

  it('disconnects a provider by its account, once something else remains', () => {
    accounts = [credential, github];

    render(<LinkedAccounts />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[1]!);

    expect(unlink).toHaveBeenCalledWith({ providerId: 'github', accountId: 'gh-1' });
  });

  it('offers only the providers that are not linked yet', () => {
    accounts = [credential, github];

    render(<LinkedAccounts />);

    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).not.toBeInTheDocument();
  });

  it('sends you to the provider to connect it', () => {
    accounts = [credential];

    render(<LinkedAccounts />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    expect(linkSocial).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: '/dashboard/settings',
    });
  });
});
