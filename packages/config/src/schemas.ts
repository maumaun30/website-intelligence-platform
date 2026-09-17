import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Settings every process in the platform shares. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

export const redisEnvSchema = z.object({
  REDIS_URL: z.url(),
});

/**
 * The canonical public URL of the web app. Emails and auth redirects link back to it, so it is
 * shared by every process that builds a user-facing link (the API and the worker).
 */
export const appEnvSchema = z.object({
  APP_URL: z.url().default('http://localhost:3000'),
});

/**
 * Better Auth secrets. Only the API instantiates the auth server, so only it requires these.
 * The secret is mandatory and has no default: signing sessions with a guessable key is a
 * vulnerability, not a convenience, so the process must refuse to boot without a real one.
 */
export const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url().default('http://localhost:4000'),
});

/**
 * SMTP transport for transactional email. Only the worker sends mail; the defaults target the
 * local Mailpit container so `pnpm dev` works with no extra configuration.
 */
export const smtpEnvSchema = z.object({
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_FROM: z.string().min(1).default('Website Intelligence <no-reply@wintel.local>'),
});

/** AI explanations are off unless explicitly enabled; the API refuses requests while off. */
export const aiApiEnvSchema = z.object({
  AI_EXPLANATIONS_ENABLED: z.stringbool().default(false),
});

/**
 * The worker's model access. The key is optional so the platform runs without AI; `fake` returns
 * labeled deterministic text for local development and verification, and is never the default.
 */
export const aiWorkerEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_EXPLANATION_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),
});

export const apiEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...appEnvSchema.shape,
  ...authEnvSchema.shape,
  ...aiApiEnvSchema.shape,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export const workerEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...appEnvSchema.shape,
  ...smtpEnvSchema.shape,
  ...aiWorkerEnvSchema.shape,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type AppEnv = z.infer<typeof appEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type SmtpEnv = z.infer<typeof smtpEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
