'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWebsiteInput,
  UpdateWebsiteInput,
  VerificationMethod,
  Website,
} from '@wintel/types';

import {
  createWebsite,
  deleteWebsite,
  getWebsite,
  listWebsites,
  updateWebsite,
  verifyWebsite,
  type WebsiteRequestError,
} from './websites-client';

export function useWebsites() {
  return useQuery({ queryKey: ['websites'], queryFn: () => listWebsites() });
}

export function useWebsite(id: string) {
  return useQuery({ queryKey: ['websites', id], queryFn: () => getWebsite(id) });
}

export function useCreateWebsite() {
  const client = useQueryClient();

  return useMutation<Website, WebsiteRequestError, CreateWebsiteInput>({
    mutationFn: (input) => createWebsite(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['websites'] }),
  });
}

export function useUpdateWebsite(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateWebsiteInput) => updateWebsite(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['websites', id] }),
  });
}

export function useDeleteWebsite() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWebsite(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['websites'] }),
  });
}

export function useVerifyWebsite(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (method: VerificationMethod) => verifyWebsite(id, method),
    onSuccess: () => client.invalidateQueries({ queryKey: ['websites', id] }),
  });
}
