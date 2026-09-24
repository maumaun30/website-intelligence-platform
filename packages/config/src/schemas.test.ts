import { describe, expect, it } from 'vitest';

import { loadEnv } from './load-env';
import { apiEnvSchema, workerEnvSchema } from './schemas';

const validInfra = {
  DATABASE_URL: 'postgresql://wintel:wintel@localhost:5433/wintel?schema=public',
  REDIS_URL: 'redis://localhost:6380',
};

const validApi = {
  ...validInfra,
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
};

describe('apiEnvSchema', () => {
  it('applies defaults for everything except the infrastructure URLs', () => {
    const env = loadEnv(apiEnvSchema, validApi);

    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:4000');
  });

  it('requires BETTER_AUTH_SECRET', () => {
    expect(() => loadEnv(apiEnvSchema, validInfra)).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validApi, BETTER_AUTH_SECRET: 'too-short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('coerces PORT from a string to a number', () => {
    const env = loadEnv(apiEnvSchema, { ...validApi, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('splits and trims CORS_ORIGINS into a list', () => {
    const env = loadEnv(apiEnvSchema, {
      ...validApi,
      CORS_ORIGINS: 'https://a.test, https://b.test ,',
    });

    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('rejects a DATABASE_URL that is not a URL', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validApi, DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validApi, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validApi, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

describe('workerEnvSchema', () => {
  it('defaults WORKER_CONCURRENCY to 5', () => {
    const env = loadEnv(workerEnvSchema, validInfra);

    expect(env.WORKER_CONCURRENCY).toBe(5);
  });

  it('coerces WORKER_CONCURRENCY from a string', () => {
    const env = loadEnv(workerEnvSchema, { ...validInfra, WORKER_CONCURRENCY: '12' });

    expect(env.WORKER_CONCURRENCY).toBe(12);
  });

  it('rejects an out-of-range WORKER_CONCURRENCY', () => {
    expect(() => loadEnv(workerEnvSchema, { ...validInfra, WORKER_CONCURRENCY: '200' })).toThrow(
      /WORKER_CONCURRENCY/,
    );
  });

  it('defaults SMTP settings and APP_URL to the local stack', () => {
    const env = loadEnv(workerEnvSchema, validInfra);

    expect(env.SMTP_HOST).toBe('localhost');
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.APP_URL).toBe('http://localhost:3000');
  });

  it('coerces SMTP_PORT from a string', () => {
    const env = loadEnv(workerEnvSchema, { ...validInfra, SMTP_PORT: '2525' });

    expect(env.SMTP_PORT).toBe(2525);
  });
});
describe('AI settings', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('keeps AI explanations off unless enabled', () => {
    const api = apiEnvSchema.parse({ ...base, BETTER_AUTH_SECRET: 'x'.repeat(32) });
    expect(api.AI_EXPLANATIONS_ENABLED).toBe(false);
    expect(
      apiEnvSchema.parse({
        ...base,
        BETTER_AUTH_SECRET: 'x'.repeat(32),
        AI_EXPLANATIONS_ENABLED: 'true',
      }).AI_EXPLANATIONS_ENABLED,
    ).toBe(true);
  });

  it('defaults the worker to the anthropic provider with no key', () => {
    const worker = workerEnvSchema.parse(base);
    expect(worker.AI_EXPLANATION_PROVIDER).toBe('anthropic');
    expect(worker.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe('stripe configuration', () => {
  it('defaults to the fake provider with no keys', () => {
    const env = loadEnv(apiEnvSchema, validApi);

    expect(env.STRIPE_PROVIDER).toBe('fake');
  });

  it('gives the fake provider working price ids so offline checkout runs', () => {
    const env = loadEnv(apiEnvSchema, validApi);

    expect(env.STRIPE_PRICE_PRO).toBe('price_fake_pro');
    expect(env.STRIPE_PRICE_AGENCY).toBe('price_fake_agency');
  });

  it('keeps real price ids when they are provided', () => {
    const env = loadEnv(apiEnvSchema, { ...validApi, STRIPE_PRICE_PRO: 'price_real' });

    expect(env.STRIPE_PRICE_PRO).toBe('price_real');
  });

  it('requires the key, webhook secret and both prices when the provider is stripe', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validApi, STRIPE_PROVIDER: 'stripe' })).toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });

  it('accepts a fully configured stripe provider', () => {
    const env = loadEnv(apiEnvSchema, {
      ...validApi,
      STRIPE_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      STRIPE_PRICE_PRO: 'price_pro',
      STRIPE_PRICE_AGENCY: 'price_agency',
    });

    expect(env.STRIPE_PRICE_PRO).toBe('price_pro');
  });
});
