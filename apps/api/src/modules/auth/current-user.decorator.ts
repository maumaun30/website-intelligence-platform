import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Principal } from '@wintel/types';
import type { Request } from 'express';

/** An Express request after SessionGuard has resolved and attached the authenticated principal. */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/**
 * Exposes the resolved principal to controllers so business logic reads a typed value instead of
 * reaching into the raw request. Only meaningful on routes behind SessionGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.principal;
  },
);
