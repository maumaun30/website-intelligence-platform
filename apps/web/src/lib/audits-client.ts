import {
  type Audit,
  type AuditRuleId,
  type IssueList,
  auditSchema,
  issueListSchema,
} from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(`Audit request failed (${response.status})`, response.status);
  }

  return response;
}

/** The scan's audit, or null when none exists yet. */
export async function getAudit(scanId: string): Promise<Audit | null> {
  try {
    const response = await request(`/scans/${scanId}/audit`);

    return auditSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function rerunAudit(scanId: string): Promise<Audit> {
  const response = await request(`/scans/${scanId}/audit`, { method: 'POST' });

  return auditSchema.parse(await response.json());
}

export async function listIssues(
  scanId: string,
  query: { ruleId: AuditRuleId; limit: number; offset: number },
): Promise<IssueList> {
  const response = await request(
    `/scans/${scanId}/issues?ruleId=${query.ruleId}&limit=${query.limit}&offset=${query.offset}`,
  );

  return issueListSchema.parse(await response.json());
}
