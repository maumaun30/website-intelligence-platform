import { z } from 'zod';

export const DEPENDENCY_STATUSES = ['up', 'down'] as const;
export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number];

export const OVERALL_HEALTH_STATUSES = ['ok', 'degraded'] as const;
export type OverallHealthStatus = (typeof OVERALL_HEALTH_STATUSES)[number];

export const dependencyCheckSchema = z.object({
  status: z.enum(DEPENDENCY_STATUSES),
  latencyMs: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export const healthCheckResponseSchema = z.object({
  status: z.enum(OVERALL_HEALTH_STATUSES),
  uptimeSeconds: z.number().int().nonnegative(),
  version: z.string().min(1),
  checks: z.object({
    database: dependencyCheckSchema,
    redis: dependencyCheckSchema,
  }),
});

export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;
export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;
