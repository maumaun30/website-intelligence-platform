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
  /**
   * The registrable domain to scope session cookies to, e.g. `.wintel.app`, when the web app and
   * the API sit on different hostnames. Unset locally, where both are `localhost` and a host-only
   * cookie is correct — and unset is also the safe default, since widening a cookie's scope is
   * something to do deliberately.
   */
  AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
});

/**
 * SMTP transport for transactional email. Only the worker sends mail; the defaults target the
 * local Mailpit container so `pnpm dev` works with no extra configuration.
 */
export const smtpEnvSchema = z
  .object({
    /**
     * `smtp` is the default so `pnpm dev` keeps delivering into the local Mailpit container with
     * no configuration. `resend` posts to Resend's HTTP API instead, which is what production
     * uses: hosts commonly block outbound SMTP, and an HTTP failure says why.
     */
    EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_FROM: z.string().min(1).default('Website Intelligence <no-reply@wintel.local>'),
    RESEND_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is "resend"',
      });
    }
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

/**
 * Stripe access. `fake` keeps local development and tests offline and is the default, so a
 * half-configured deployment cannot silently take payments. With `stripe`, all four values are
 * required and the process refuses to boot without them rather than failing at the first checkout.
 */
export const stripeApiEnvSchema = z
  .object({
    STRIPE_PROVIDER: z.enum(['stripe', 'fake']).default('fake'),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PRICE_PRO: z.string().min(1).optional(),
    STRIPE_PRICE_AGENCY: z.string().min(1).optional(),
  })
  .transform((env) =>
    // The offline provider still needs price ids to map plans; real deployments always set their
    // own, and `stripe` refuses to boot without them below.
    env.STRIPE_PROVIDER === 'fake'
      ? {
          ...env,
          STRIPE_PRICE_PRO: env.STRIPE_PRICE_PRO ?? 'price_fake_pro',
          STRIPE_PRICE_AGENCY: env.STRIPE_PRICE_AGENCY ?? 'price_fake_agency',
        }
      : env,
  )
  .superRefine((env, ctx) => {
    if (env.STRIPE_PROVIDER !== 'stripe') {
      return;
    }
    for (const key of [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_PRO',
      'STRIPE_PRICE_AGENCY',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when STRIPE_PROVIDER is "stripe"`,
        });
      }
    }
  });

/**
 * Social sign-in. Each provider is optional and only registered when BOTH halves of its pair are
 * present, so local and CI runs stay offline and a half-configured provider fails loudly at boot
 * rather than silently disappearing from the sign-in page.
 */
export const oauthApiEnvSchema = z
  .object({
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    for (const [id, secret] of [
      ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    ] as const) {
      const hasId = env[id] !== undefined;
      const hasSecret = env[secret] !== undefined;
      if (hasId !== hasSecret) {
        ctx.addIssue({
          code: 'custom',
          path: [hasId ? secret : id],
          message: `${id} and ${secret} must be set together`,
        });
      }
    }
  });

export const apiEnvSchema = z
  .object({
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
  })
  .and(stripeApiEnvSchema)
  .and(oauthApiEnvSchema);

export const workerEnvSchema = z
  .object({
    ...baseEnvSchema.shape,
    ...databaseEnvSchema.shape,
    ...redisEnvSchema.shape,
    ...appEnvSchema.shape,
    ...aiWorkerEnvSchema.shape,
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
    /**
     * Lets the crawler reach loopback and private addresses. Development only: it exists so a test
     * site on localhost can be scanned. In production it must stay false, or a user can point a
     * website at an internal address and read the response back out of the stored scan.
     */
    ALLOW_PRIVATE_SCAN_TARGETS: z.stringbool().default(false),
  })
  .and(smtpEnvSchema);

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type AppEnv = z.infer<typeof appEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type SmtpEnv = z.infer<typeof smtpEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
