import { type PageList, type Scan, pageListSchema, scanSchema } from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const scanListSchema = scanSchema.array();

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(`Scan request failed (${response.status})`, response.status);
  }

  return response;
}

export async function startScan(websiteId: string): Promise<Scan> {
  const response = await request(`/websites/${websiteId}/scans`, { method: 'POST' });

  return scanSchema.parse(await response.json());
}

export async function listScans(websiteId: string): Promise<Scan[]> {
  const response = await request(`/websites/${websiteId}/scans`);

  return scanListSchema.parse(await response.json());
}

export async function listScanPages(
  scanId: string,
  page: { limit: number; offset: number },
): Promise<PageList> {
  const response = await request(
    `/scans/${scanId}/pages?limit=${page.limit}&offset=${page.offset}`,
  );

  return pageListSchema.parse(await response.json());
}
