import {
  type CreateWebsiteInput,
  type UpdateWebsiteInput,
  type VerificationMethod,
  type Website,
  websiteSchema,
} from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const websiteListSchema = websiteSchema.array();

/** An API error that also carries the server's machine-readable `details.code`. */
export class WebsiteRequestError extends ApiError {
  constructor(
    status: number,
    readonly code: string | null,
  ) {
    super(`Website request failed (${status})`, status);
  }
}

/** Every call is cookie-authenticated and tenant-scoped server-side by the caller's active org. */
async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1/websites${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      details?: { code?: string };
    } | null;
    throw new WebsiteRequestError(response.status, body?.details?.code ?? null);
  }

  return response;
}

export async function listWebsites(): Promise<Website[]> {
  const response = await request('');

  return websiteListSchema.parse(await response.json());
}

export async function getWebsite(id: string): Promise<Website> {
  const response = await request(`/${id}`);

  return websiteSchema.parse(await response.json());
}

export async function createWebsite(input: CreateWebsiteInput): Promise<Website> {
  const response = await request('', { method: 'POST', body: JSON.stringify(input) });

  return websiteSchema.parse(await response.json());
}

export async function updateWebsite(id: string, input: UpdateWebsiteInput): Promise<Website> {
  const response = await request(`/${id}`, { method: 'PATCH', body: JSON.stringify(input) });

  return websiteSchema.parse(await response.json());
}

export async function deleteWebsite(id: string): Promise<void> {
  await request(`/${id}`, { method: 'DELETE' });
}

export async function verifyWebsite(id: string, method: VerificationMethod): Promise<Website> {
  const response = await request(`/${id}/verify`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  });

  return websiteSchema.parse(await response.json());
}
