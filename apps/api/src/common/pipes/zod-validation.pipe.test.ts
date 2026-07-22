import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(1),
  count: z.coerce.number().int().positive(),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed and transformed value', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ name: 'crawl', count: '3' })).toEqual({ name: 'crawl', count: 3 });
  });

  it('throws BadRequestException for an invalid value', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ name: '', count: 3 })).toThrow(BadRequestException);
  });

  it('reports every offending field in the exception details', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ name: '', count: -1 });
      expect.unreachable('pipe should have thrown');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        message: string;
        details: Array<{ path: string; message: string }>;
      };

      expect(response.message).toBe('Validation failed');
      expect(response.details.map((detail) => detail.path).sort()).toEqual(['count', 'name']);
    }
  });
});
