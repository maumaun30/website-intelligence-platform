import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrganizationRole } from '@wintel/types';

import type { AuthenticatedRequest } from './current-user.decorator';
import { Roles } from './roles.decorator';

/** Privilege order: a higher rank satisfies any requirement at or below it. */
const ROLE_RANK: Record<OrganizationRole, number> = { member: 1, admin: 2, owner: 3 };

/**
 * Enforces the minimum organization role declared with `@Roles`. Runs after SessionGuard, which
 * resolves the principal's role from the active organization membership; a missing or insufficient
 * role is a 403. Routes without `@Roles` are unaffected.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.principal?.role;

    if (!role || ROLE_RANK[role] < ROLE_RANK[required]) {
      throw new ForbiddenException();
    }

    return true;
  }
}
