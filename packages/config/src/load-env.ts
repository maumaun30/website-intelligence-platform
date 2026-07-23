import type { ZodType } from 'zod';

import { EnvValidationError } from './errors';

/**
 * Parses and validates an environment source against a schema.
 *
 * @throws {EnvValidationError} with every offending variable listed, so a misconfigured
 * deployment is diagnosable from a single log line rather than one restart per mistake.
 */
export function loadEnv<TOutput>(
  schema: ZodType<TOutput>,
  source: Record<string, string | undefined> = process.env,
): TOutput {
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new EnvValidationError(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
