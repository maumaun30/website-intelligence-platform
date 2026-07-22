import { STATUS_CODES } from 'node:http';

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

interface ExceptionDescription {
  statusCode: number;
  message: string;
  details?: unknown;
}

/**
 * Reduces any thrown value to a client-safe status, message and optional details.
 *
 * Non-HTTP exceptions are deliberately flattened to a generic 500 message: an unexpected error
 * can carry connection strings, tokens, or query fragments, and none of that belongs in a
 * response body. The real error still reaches the logs.
 */
export function describeException(exception: unknown): ExceptionDescription {
  if (!(exception instanceof HttpException)) {
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }

  const statusCode = exception.getStatus();
  const body = exception.getResponse();

  if (typeof body === 'string') {
    return { statusCode, message: body };
  }

  const record = body as Record<string, unknown>;
  const rawMessage = record.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join('; ')
    : typeof rawMessage === 'string'
      ? rawMessage
      : exception.message;

  return record.details === undefined
    ? { statusCode, message }
    : { statusCode, message, details: record.details };
}

/** Gives every error leaving the API one shape, and every 5xx one log line. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();

    const { statusCode, message, details } = describeException(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId: request.id, path: request.url },
        'Unhandled exception',
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      ...(request.id === undefined ? {} : { requestId: request.id }),
      ...(details === undefined ? {} : { details }),
    };

    response.status(statusCode).json(body);
  }
}
