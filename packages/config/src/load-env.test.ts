import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EnvValidationError } from './errors';
import { loadEnv } from './load-env';

const schema = z.object({
  REQUIRED_VALUE: z.string().min(1),
  SECOND_VALUE: z.string().min(1),
  OPTIONAL_VALUE: z.string().default('fallback'),
});

describe('loadEnv', () => {
  it('returns the parsed value when the source is valid', () => {
    const result = loadEnv(schema, { REQUIRED_VALUE: 'present', SECOND_VALUE: 'also-present' });

    expect(result).toEqual({
      REQUIRED_VALUE: 'present',
      SECOND_VALUE: 'also-present',
      OPTIONAL_VALUE: 'fallback',
    });
  });

  it('throws EnvValidationError when a required variable is missing', () => {
    expect(() => loadEnv(schema, {})).toThrow(EnvValidationError);
  });

  it('names every offending variable in the error message', () => {
    let message = '';
    try {
      loadEnv(schema, { REQUIRED_VALUE: '', SECOND_VALUE: '' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('Invalid environment configuration');
    expect(message).toContain('REQUIRED_VALUE');
    expect(message).toContain('SECOND_VALUE');
  });

  it('reads from process.env when no source is given', () => {
    process.env.REQUIRED_VALUE = 'from-process-env';
    process.env.SECOND_VALUE = 'second-from-process-env';

    const result = loadEnv(schema);

    expect(result.REQUIRED_VALUE).toBe('from-process-env');
    expect(result.SECOND_VALUE).toBe('second-from-process-env');
    delete process.env.REQUIRED_VALUE;
    delete process.env.SECOND_VALUE;
  });
});
