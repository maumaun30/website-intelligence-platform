import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { describeException } from './all-exceptions.filter';

describe('describeException', () => {
  it('describes an HttpException carrying a string body', () => {
    const result = describeException(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT));

    expect(result).toEqual({ statusCode: 418, message: 'Teapot' });
  });

  it('describes an HttpException carrying an object body with details', () => {
    const exception = new BadRequestException({
      message: 'Validation failed',
      details: [{ path: 'name', message: 'Required' }],
    });

    const result = describeException(exception);

    expect(result.statusCode).toBe(400);
    expect(result.message).toBe('Validation failed');
    expect(result.details).toEqual([{ path: 'name', message: 'Required' }]);
  });

  it('joins an array message into a single string', () => {
    const result = describeException(new BadRequestException(['too short', 'not a url']));

    expect(result.message).toBe('too short; not a url');
  });

  it('never leaks the message of a non-HTTP exception', () => {
    const result = describeException(new Error('connection string is postgres://user:hunter2@db'));

    expect(result).toEqual({ statusCode: 500, message: 'Internal server error' });
  });
});
