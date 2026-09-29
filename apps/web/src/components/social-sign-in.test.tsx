import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the file body, so the spy has to be hoisted with them.
const { social } = vi.hoisted(() => ({ social: vi.fn() }));
let providers: string[] | undefined = [];

vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { social } } }));
vi.mock('@/lib/use-account', () => ({ useAuthProviders: () => ({ data: providers }) }));

import { SocialSignIn } from './social-sign-in';

afterEach(() => {
  cleanup();
  social.mockReset();
  providers = [];
});

describe('SocialSignIn', () => {
  it('renders nothing when the deployment configured no provider', () => {
    const { container } = render(<SocialSignIn />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the provider list is still unknown', () => {
    providers = undefined;

    const { container } = render(<SocialSignIn />);

    expect(container).toBeEmptyDOMElement();
  });

  it('offers a button per configured provider, and starts the redirect', () => {
    providers = ['github', 'google'];

    render(<SocialSignIn />);

    expect(screen.getByRole('button', { name: /Continue with GitHub/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));

    expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/dashboard' });
  });
});
