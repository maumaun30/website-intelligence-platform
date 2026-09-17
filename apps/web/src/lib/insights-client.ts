import {
  type IssueChangeKind,
  type IssueChangeList,
  type OverviewRow,
  type TrendPoint,
  issueChangeListSchema,
  overviewRowSchema,
  trendPointSchema,
} from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request(path: string): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
  });

  if (!response.ok) {
    throw new ApiError(`Insights request failed (${response.status})`, response.status);
  }

  return response;
}

export async function getOverview(): Promise<OverviewRow[]> {
  const response = await request('/overview');

  return overviewRowSchema.array().parse(await response.json());
}

export async function getTrend(websiteId: string): Promise<TrendPoint[]> {
  const response = await request(`/websites/${websiteId}/trend`);

  return trendPointSchema.array().parse(await response.json());
}

export async function listChanges(
  scanId: string,
  query: { kind: IssueChangeKind; limit: number; offset: number },
): Promise<IssueChangeList> {
  const response = await request(
    `/scans/${scanId}/changes?kind=${query.kind}&limit=${query.limit}&offset=${query.offset}`,
  );

  return issueChangeListSchema.parse(await response.json());
}
