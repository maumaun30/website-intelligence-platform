'use client';

import { Button, Input, Label, Select } from '@wintel/ui';
import { type FormEvent, useState } from 'react';

import {
  useInviteMember,
  useOrganization,
  useRemoveMember,
  useRenameOrganization,
} from '@/lib/use-account';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

/**
 * The organization every website, scan and subscription hangs off. Renaming and inviting are
 * admin+ on the API; this hides them from everyone else rather than letting them fail.
 */
export function OrganizationSection({ canManage }: { canManage: boolean }) {
  const organization = useOrganization();
  const rename = useRenameOrganization();
  const invite = useInviteMember();
  const removeMember = useRemoveMember();
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');

  if (organization.isPending) {
    return <p className="text-sm text-muted-foreground">Loading your organization…</p>;
  }
  if (organization.isError || !organization.data) {
    return <p className="text-sm text-destructive">Could not load your organization.</p>;
  }

  const current = organization.data;
  const value = name ?? current.name;
  const members = current.members ?? [];
  const invitations = (current.invitations ?? []).filter(
    (invitation) => invitation.status === 'pending',
  );

  const onRename = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate({ organizationId: current.id, name: value.trim() });
  };

  const onInvite = (event: FormEvent) => {
    event.preventDefault();
    invite.mutate({ email: email.trim(), role }, { onSuccess: () => setEmail('') });
  };

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <form onSubmit={onRename} className="flex flex-col gap-2.5">
          <Label htmlFor="organization-name">Organization name</Label>
          <div className="flex gap-2">
            <Input
              id="organization-name"
              value={value}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={rename.isPending || value.trim() === current.name}
            >
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {rename.isError ? (
            <p role="alert" className="text-[13px] text-destructive">
              Could not rename the organization.
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-muted-foreground">Organization</span>
          <span className="text-sm">{current.name}</span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-medium">Members</span>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">
                  {member.user?.name ?? member.user?.email}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {member.user?.email}
                </span>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {ROLE_LABELS[member.role] ?? member.role}
              </span>
              {canManage && member.role !== 'owner' ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={removeMember.isPending}
                  onClick={() => removeMember.mutate(member.id)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {invitations.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-medium">Pending invitations</span>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 truncate font-mono text-xs">{invitation.email}</span>
                <span className="text-xs text-muted-foreground">
                  {ROLE_LABELS[invitation.role] ?? invitation.role} · invited
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? (
        <form onSubmit={onInvite} className="flex flex-col gap-2.5">
          <Label htmlFor="invite-email">Invite someone</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              className="min-w-60 flex-1"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Select
              aria-label="Role"
              className="w-36"
              value={role}
              onChange={(event) => setRole(event.target.value as 'member' | 'admin')}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
            <Button type="submit" variant="outline" disabled={invite.isPending}>
              {invite.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
          {invite.isError ? (
            <p role="alert" className="text-[13px] text-destructive">
              Could not send that invitation.
            </p>
          ) : invite.isSuccess ? (
            <p role="status" className="text-[13px] text-muted-foreground">
              Invitation sent. It expires in 48 hours.
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
