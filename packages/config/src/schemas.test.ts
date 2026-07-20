import { describe, expect, it } from 'vitest';

import { loadEnv } from './load-env';
import { apiEnvSchema, workerEnvSchema } from './schemas';

const validInfra = {
  DATABASE_URL: 'postgresql://wintel:wintel@localhost:5433/wintel?schema=public',
  REDIS_URL: 'redis://localhost:6380',
};

describe('apiEnvSchema', () => {
  it('applies defaults for everything except the infrastructure URLs', () => {
    const env = loadEnv(apiEnvSchema, validInfra);

    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('coerces PORT from a string to a number', () => {
    const env = loadEnv(apiEnvSchema, { ...validInfra, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('splits and trims CORS_ORIGINS into a list', () => {
    const env = loadEnv(apiEnvSchema, {
      ...validInfra,
      CORS_ORIGINS: 'https://a.test, https://b.test ,',
    });

    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('rejects a DATABASE_URL that is not a URL', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validInfra, DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validInfra, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validInfra, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
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
});
