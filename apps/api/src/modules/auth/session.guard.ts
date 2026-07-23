import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ORGANIZATION_ROLES, type OrganizationRole } from '@wintel/types';
import { fromNodeHeaders } from 'better-auth/node';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AUTH_INSTANCE } from './auth.tokens';
import type { Auth } from './create-auth';
import type { AuthenticatedRequest } from './current-user.decorator';

function toOrganizationRole(role: string | undefined): OrganizationRole | null {
  return ORGANIZATION_ROLES.includes(role as OrganizationRole) ? (role as OrganizationRole) : null;
}

/**
 * Resolves the Better Auth session from the request cookies and attaches the principal — the user,
 * the active organization, and the caller's role within it. Rejects with 401 when there is no
 * valid session. The role is read from the member row so the tenant boundary is enforced from the
 * database, never trusted from the client.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });

    if (!session) {
      throw new UnauthorizedException();
    }

    const activeOrganizationId = session.session.activeOrganizationId ?? null;
    let role: OrganizationRole | null = null;

    if (activeOrganizationId) {
      const member = await this.prisma.client.member.findFirst({
        where: { userId: session.user.id, organizationId: activeOrganizationId },
      });
      role = toOrganizationRole(member?.role);
    }

    request.principal = {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
      },
      activeOrganizationId,
      role,
    };

    return true;
  }
}
