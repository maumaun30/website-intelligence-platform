import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from './create-client';
import type { PrismaClient } from './index';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the database integration tests.');
}

let client: PrismaClient | undefined;
const createdUserIds: string[] = [];
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  if (client) {
    // Members and invitations cascade from their organization and user, so removing the roots
    // clears the whole graph and keeps the shared test database clean between runs.
    await client.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await client.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await client.$disconnect();
  }
  createdUserIds.length = 0;
  createdOrganizationIds.length = 0;
  client = undefined;
});

describe('auth and organization models', () => {
  it('round-trips a user, organization, membership and invitation with relations', async () => {
    client = createPrismaClient({ databaseUrl });
    const suffix = randomUUID().slice(0, 8);

    const user = await client.user.create({
      data: { id: randomUUID(), name: 'Ada Lovelace', email: `owner-${suffix}@wintel.test` },
    });
    createdUserIds.push(user.id);

    const organization = await client.organization.create({
      data: { id: randomUUID(), name: 'Analytical Engines', slug: `ae-${suffix}` },
    });
    createdOrganizationIds.push(organization.id);

    await client.member.create({
      data: {
        id: randomUUID(),
        organizationId: organization.id,
        userId: user.id,
        role: 'owner',
      },
    });

    await client.invitation.create({
      data: {
        id: randomUUID(),
        organizationId: organization.id,
        email: `invitee-${suffix}@wintel.test`,
        inviterId: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const loaded = await client.organization.findUniqueOrThrow({
      where: { id: organization.id },
      include: { members: { include: { user: true } }, invitations: true },
    });

    expect(loaded.members).toHaveLength(1);
    expect(loaded.members[0]?.role).toBe('owner');
    expect(loaded.members[0]?.user.email).toBe(`owner-${suffix}@wintel.test`);
    expect(loaded.invitations).toHaveLength(1);
    expect(loaded.invitations[0]?.status).toBe('pending');
    expect(loaded.invitations[0]?.email).toBe(`invitee-${suffix}@wintel.test`);
  });

  it('enforces the unique organization slug', async () => {
    client = createPrismaClient({ databaseUrl });
    const slug = `dup-${randomUUID().slice(0, 8)}`;

    const first = await client.organization.create({
      data: { id: randomUUID(), name: 'First', slug },
    });
    createdOrganizationIds.push(first.id);

    await expect(
      client.organization.create({ data: { id: randomUUID(), name: 'Second', slug } }),
    ).rejects.toThrow();
  });

  it('cascades member deletion when the organization is removed', async () => {
    client = createPrismaClient({ databaseUrl });
    const suffix = randomUUID().slice(0, 8);

    const user = await client.user.create({
      data: { id: randomUUID(), name: 'Grace Hopper', email: `grace-${suffix}@wintel.test` },
    });
    createdUserIds.push(user.id);

    const organization = await client.organization.create({
      data: { id: randomUUID(), name: 'Compilers', slug: `co-${suffix}` },
    });

    const member = await client.member.create({
      data: { id: randomUUID(), organizationId: organization.id, userId: user.id },
    });

    await client.organization.delete({ where: { id: organization.id } });

    expect(await client.member.findUnique({ where: { id: member.id } })).toBeNull();
  });
});
