import { PrismaClient } from '../generated/client';

export interface CreatePrismaClientOptions {
  /** Full Postgres connection string. Passed explicitly so callers own their configuration. */
  databaseUrl: string;
  /** Log every SQL statement. Useful in local development, far too noisy in production. */
  logQueries?: boolean;
}

/**
 * Builds a PrismaClient.
 *
 * The connection string is injected rather than read from `process.env` inside this package,
 * so consumers (API, worker, tests, future CLIs) each keep a single validated source of
 * configuration and nothing reaches around them into the ambient environment.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  return new PrismaClient({
    datasourceUrl: options.databaseUrl,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
