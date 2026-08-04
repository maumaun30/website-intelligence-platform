import { z } from 'zod';

/** Organization roles, most privileged first. Mirrors the Better Auth organization plugin. */
export const ORGANIZATION_ROLES = ['owner', 'admin', 'member'] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/** Lifecycle of an invitation, mirroring the Better Auth organization plugin. */
export const INVITATION_STATUSES = ['pending', 'accepted', 'rejected', 'canceled'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Minimum password length. Better Auth hashes and stores the password; this bound is the shared
 * contract the sign-up form and the API both enforce so the two never disagree on what is valid.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const signUpInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(256),
});

export const signInInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/** A user as exposed to the client — never includes password or account material. */
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable().optional(),
});

/**
 * The resolved principal attached to every authenticated request: the user, the organization the
 * request is acting within, and the caller's role in it. `activeOrganizationId` is nullable so the
 * shape can also describe the brief window before an active organization is selected.
 */
export const principalSchema = z.object({
  user: userSchema,
  activeOrganizationId: z.string().nullable(),
  role: z.enum(ORGANIZATION_ROLES).nullable(),
});

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const memberSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  role: z.enum(ORGANIZATION_ROLES),
  createdAt: z.string(),
});

export const invitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.email(),
  role: z.enum(ORGANIZATION_ROLES).nullable().optional(),
  status: z.enum(INVITATION_STATUSES),
  expiresAt: z.string(),
  inviterId: z.string(),
  createdAt: z.string(),
});

export const invitationInputSchema = z.object({
  email: z.email(),
  role: z.enum(ORGANIZATION_ROLES).default('member'),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;
export type SignInInput = z.infer<typeof signInInputSchema>;
export type User = z.infer<typeof userSchema>;
export type Principal = z.infer<typeof principalSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.infer<typeof invitationInputSchema>;
