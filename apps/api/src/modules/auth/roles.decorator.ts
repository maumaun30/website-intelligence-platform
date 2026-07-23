import { Reflector } from '@nestjs/core';
import type { OrganizationRole } from '@wintel/types';

/**
 * Marks a route with the minimum organization role required to reach it. Enforced by RolesGuard,
 * which must run after SessionGuard so the principal's role is already resolved.
 */
export const Roles = Reflector.createDecorator<OrganizationRole>();
