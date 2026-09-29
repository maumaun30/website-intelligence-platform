import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/sign-out-button', () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));
vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <div role="radiogroup" aria-label="Theme" />,
}));

import { UserMenu } from './user-menu';

const user = { name: 'Ada Lovelace', email: 'ada@wintel.test' };

afterEach(cleanup);

function trigger(): HTMLElement {
  return screen.getByRole('button', { expanded: false });
}

describe('UserMenu', () => {
  it('keeps the account controls behind the user row until it is opened', () => {
    render(<UserMenu user={user} collapsed={false} />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(trigger());

    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
    expect(screen.getByRole('menuitem', { name: 'Billing and plan' })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    );
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('closes on Escape and hands focus back to the row', () => {
    render(<UserMenu user={user} collapsed={false} />);
    const button = trigger();
    fireEvent.click(button);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes when the click lands outside it', () => {
    render(<UserMenu user={user} collapsed={false} />);
    fireEvent.click(trigger());

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('collapses to the avatar alone, still named for screen readers', () => {
    render(<UserMenu user={user} collapsed />);

    expect(screen.queryByText('ada@wintel.test')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace — account menu')).toBeInTheDocument();
  });
});
