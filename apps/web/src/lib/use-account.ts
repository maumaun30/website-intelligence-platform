'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authClient } from './auth-client';
import { getMe } from './me-client';

/** Better Auth returns `{ data, error }` rather than throwing, so every hook unwraps it here. */
function unwrap<T>(result: { data: T | null; error?: { message?: string } | null }): T {
  if (result.error) {
    throw new Error(result.error.message ?? 'Request failed.');
  }
  return result.data as T;
}

export function useSessions() {
  return useQuery({
    queryKey: ['account', 'sessions'],
    queryFn: async () => unwrap(await authClient.listSessions()),
  });
}

export function useUpdateName() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => unwrap(await authClient.updateUser({ name })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account'] }),
  });
}

/**
 * The confirmation goes to the address already on file, so the change only takes effect once
 * someone with that inbox approves it.
 */
export function useChangeEmail() {
  return useMutation({
    mutationFn: async (newEmail: string) =>
      unwrap(
        await authClient.changeEmail({
          newEmail,
          callbackURL: '/dashboard/settings',
        }),
      ),
  });
}

export function useChangePassword() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) =>
      unwrap(
        await authClient.changePassword({
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          // A password change is what you do when you think someone else is in: end their sessions.
          revokeOtherSessions: true,
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account', 'sessions'] }),
  });
}

export function useRevokeSession() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => unwrap(await authClient.revokeSession({ token })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account', 'sessions'] }),
  });
}

export function useRevokeOtherSessions() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async () => unwrap(await authClient.revokeOtherSessions()),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account', 'sessions'] }),
  });
}

export function useOrganization() {
  return useQuery({
    queryKey: ['account', 'organization'],
    queryFn: async () => unwrap(await authClient.organization.getFullOrganization()),
  });
}

export function useRenameOrganization() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: { organizationId: string; name: string }) =>
      unwrap(
        await authClient.organization.update({
          organizationId: input.organizationId,
          data: { name: input.name },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account', 'organization'] }),
  });
}

export function useInviteMember() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: { email: string; role: 'member' | 'admin' }) =>
      unwrap(await authClient.organization.inviteMember(input)),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account'] }),
  });
}

export function useRemoveMember() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (memberIdOrEmail: string) =>
      unwrap(await authClient.organization.removeMember({ memberIdOrEmail })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account', 'organization'] }),
  });
}

export function useMe() {
  return useQuery({ queryKey: ['account', 'me'], queryFn: () => getMe() });
}
