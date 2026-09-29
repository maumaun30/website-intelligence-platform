import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rename = vi.fn();
const invite = vi.fn();
const removeMember = vi.fn();
let organization: unknown = null;

vi.mock('@/lib/use-account', () => ({
  useOrganization: () => ({ data: organization, isPending: false, isError: false }),
  useRenameOrganization: () => ({ mutate: rename, isPending: false, isError: false }),
  useInviteMember: () => ({ mutate: invite, isPending: false, isError: false, isSuccess: false }),
  useRemoveMember: () => ({ mutate: removeMember, isPending: false, isError: false }),
}));

import { OrganizationSection } from './organization-section';

afterEach(() => {
  cleanup();
  rename.mockReset();
  invite.mockReset();
  removeMember.mockReset();
  organization = null;
});

const full = {
  id: 'org-1',
  name: 'Analytical Engines',
  members: [
    { id: 'm1', role: 'owner', user: { name: 'Ada', email: 'ada@wintel.test' } },
    { id: 'm2', role: 'member', user: { name: 'Charles', email: 'charles@wintel.test' } },
  ],
  invitations: [
    { id: 'i1', email: 'pending@wintel.test', role: 'member', status: 'pending' },
    { id: 'i2', email: 'gone@wintel.test', role: 'member', status: 'cancelled' },
  ],
};

describe('OrganizationSection', () => {
  it('lists members with their roles', () => {
    organization = full;

    render(<OrganizationSection canManage={false} />);

    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
  });

  it('hides renaming, inviting and removal from anyone who may not manage', () => {
    organization = full;

    render(<OrganizationSection canManage={false} />);

    expect(screen.queryByLabelText('Organization name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send invite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('invites by email with the chosen role', () => {
    organization = full;

    render(<OrganizationSection canManage />);

    fireEvent.change(screen.getByLabelText('Invite someone'), {
      target: { value: 'new@wintel.test' },
    });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(invite).toHaveBeenCalledWith(
      { email: 'new@wintel.test', role: 'admin' },
      expect.anything(),
    );
  });

  it('shows only invitations still pending, and never offers to remove the owner', () => {
    organization = full;

    render(<OrganizationSection canManage />);

    expect(screen.getByText('pending@wintel.test')).toBeInTheDocument();
    expect(screen.queryByText('gone@wintel.test')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });
});
