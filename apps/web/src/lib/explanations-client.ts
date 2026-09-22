import { type AuditRuleId, type Explanation, explanationSchema } from '@wintel/types';
import { z } from 'zod';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const errorBodySchema = z.object({ details: z.object({ code: z.string() }).optional() });

/** An API error that also carries the server's machine-readable `details.code`. */
export class ExplanationRequestError extends ApiError {
  constructor(
    status: number,
    readonly code: string | null,
  ) {
    super(`Explanation request failed (${status})`, status);
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
    throw new ExplanationRequestError(
      response.status,
      parsed.success ? (parsed.data.details?.code ?? null) : null,
    );
  }

  return response;
}

export async function getExplanation(
  scanId: string,
  ruleId: AuditRuleId,
): Promise<Explanation | null> {
  try {
    const response = await request(`/scans/${scanId}/audit/explanations/${ruleId}`);

    return explanationSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function requestExplanation(
  scanId: string,
  body: { ruleId: AuditRuleId; regenerate: boolean },
): Promise<Explanation> {
  const response = await request(`/scans/${scanId}/audit/explanations`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return explanationSchema.parse(await response.json());
}
