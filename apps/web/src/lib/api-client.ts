import { type HealthCheckResponse, healthCheckResponseSchema } from '@wintel/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Fetches API health.
 *
 * A degraded API answers 503 with a perfectly valid body, so the status code is deliberately
 * not treated as failure — only a body that does not match the shared contract is. That keeps
 * "the API is unhealthy" and "we cannot talk to the API" as two distinct outcomes in the UI.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/health`, { signal, cache: 'no-store' });
  const body: unknown = await response.json().catch(() => null);

  const parsed = healthCheckResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError(
      'The API returned a response that does not match the health contract.',
      response.status,
    );
  }

  return parsed.data;
}
