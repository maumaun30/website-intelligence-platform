import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrganizationRole } from '@wintel/types';
import { describe, expect, it } from 'vitest';

import { RolesGuard } from './roles.guard';

function contextWithRole(role: OrganizationRole | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ principal: role ? { role } : {} }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardRequiring(required: OrganizationRole | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;

  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows a route with no role requirement', () => {
    expect(guardRequiring(undefined).canActivate(contextWithRole(null))).toBe(true);
  });

  it('allows a role that outranks the requirement', () => {
    expect(guardRequiring('admin').canActivate(contextWithRole('owner'))).toBe(true);
  });

  it('allows a role that exactly meets the requirement', () => {
    expect(guardRequiring('admin').canActivate(contextWithRole('admin'))).toBe(true);
  });

  it('forbids a role that is below the requirement', () => {
    expect(() => guardRequiring('admin').canActivate(contextWithRole('member'))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids a principal with no role in the active organization', () => {
    expect(() => guardRequiring('member').canActivate(contextWithRole(null))).toThrow(
      ForbiddenException,
    );
  });
});
