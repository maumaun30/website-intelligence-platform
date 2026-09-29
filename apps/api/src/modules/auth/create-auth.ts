import { randomUUID } from 'node:crypto';

import type { ApiEnv } from '@wintel/config';
import type { PrismaClient } from '@wintel/database';
import { type EmailJob, MIN_PASSWORD_LENGTH } from '@wintel/types';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization } from 'better-auth/plugins';

/** Enqueues a transactional email. The factory depends on this abstraction, not on BullMQ. */
export type EmailEnqueuer = (job: EmailJob) => Promise<void>;

export interface CreateAuthOptions {
  env: ApiEnv;
  prisma: PrismaClient;
  enqueueEmail: EmailEnqueuer;
}

/** A URL-safe slug base derived from a display name or email, always non-empty. */
function slugBase(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'org';
}

/**
 * Gives a brand-new user a personal organization they own, so no user is ever tenant-less and
 * every later query can assume an active organization exists. The slug carries a random suffix
 * because display names collide; the unique constraint on `slug` is the backstop.
 */
async function createPersonalOrganization(
  prisma: PrismaClient,
  user: { id: string; name: string; email: string },
): Promise<void> {
  const organizationId = randomUUID();

  await prisma.organization.create({
    data: {
      id: organizationId,
      name: `${user.name}'s Organization`,
      slug: `${slugBase(user.name || user.email)}-${randomUUID().slice(0, 8)}`,
    },
  });

  await prisma.member.create({
    data: { id: randomUUID(), organizationId, userId: user.id, role: 'owner' },
  });
}

/**
 * Builds the Better Auth server instance. Better Auth owns the security-critical surface (password
 * hashing, session tokens, verification tokens, CSRF); this factory only wires it to our Prisma
 * client, validated config, and email pipeline, and adds the organization behaviour the product
 * needs. Kept as a pure function so its hooks can be unit-tested without standing up NestJS.
 */
/**
 * Only providers with both halves of their credentials are registered; the config schema refuses a
 * half-configured pair, so anything missing here is deliberately absent.
 */
function socialProviders(env: CreateAuthOptions['env']) {
  return {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Shared machines otherwise reuse whichever Google account signed in last.
            prompt: 'select_account' as const,
          },
        }
      : {}),
  };
}

/** The providers this deployment can actually sign in with, for the web app to render buttons. */
export function enabledSocialProviders(env: CreateAuthOptions['env']): string[] {
  return Object.keys(socialProviders(env));
}

export function createAuth({ env, prisma, enqueueEmail }: CreateAuthOptions) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/v1/auth',
    trustedOrigins: env.CORS_ORIGINS,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    socialProviders: socialProviders(env),
    account: {
      accountLinking: {
        // Signing in with a provider joins an existing account instead of making a second one —
        // but only when the provider asserts a VERIFIED email that matches an already-verified
        // local address. No provider is listed as trusted, because trusting one would let an
        // unverified provider email take over an account by claiming its address, and
        // `requireLocalEmailVerified` (default true) keeps the local side honest too. Linking a
        // different address is a deliberate act from settings, never implicit.
        enabled: true,
        trustedProviders: [],
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    user: {
      changeEmail: {
        enabled: true,
        // The confirmation goes to the address already on file, never to the new one: a stolen
        // session then cannot move an account to an address the attacker controls without also
        // holding the original inbox. Better Auth only takes this path when the current address
        // is verified; an unverified one falls back to verifying the new address instead, which
        // is the same bar as signing up with it.
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await enqueueEmail({ type: 'email-change', to: user.email, newEmail, url });
        },
      },
    },
    emailVerification: {
      // Fire-and-forget on the queue: the request never waits on SMTP, and a slow mailer cannot
      // become a timing oracle for whether an address exists.
      sendVerificationEmail: async ({ user, url }) => {
        await enqueueEmail({ type: 'verification', to: user.email, url });
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await createPersonalOrganization(prisma, user);
          },
        },
      },
      session: {
        create: {
          // Default a new session to the user's first organization so the tenant boundary is
          // populated from the very first authenticated request.
          before: async (session) => {
            const member = await prisma.member.findFirst({
              where: { userId: session.userId },
              orderBy: { createdAt: 'asc' },
            });

            return { data: { ...session, activeOrganizationId: member?.organizationId ?? null } };
          },
        },
      },
    },
    plugins: [
      organization({
        sendInvitationEmail: async (data) => {
          await enqueueEmail({
            type: 'invitation',
            to: data.email,
            organizationName: data.organization.name,
            invitedByName: data.inviter.user.name,
            url: `${env.APP_URL}/accept-invitation/${data.id}`,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
