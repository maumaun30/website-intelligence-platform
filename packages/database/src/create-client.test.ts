import { afterEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from './create-client';
import type { PrismaClient } from './index';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the database integration tests.');
}

let client: PrismaClient | undefined;

afterEach(async () => {
  await client?.$disconnect();
  client = undefined;
});

describe('createPrismaClient', () => {
  it('connects to the configured database', async () => {
    client = createPrismaClient({ databaseUrl });

    const rows = await client.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;

    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('has applied the baseline migration', async () => {
    client = createPrismaClient({ databaseUrl });

    const rows = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;

    expect(rows.map((row) => row.migration_name)).toContain('00000000000000_baseline');
  });

  it('fails to connect when pointed at a database that does not exist', async () => {
    client = createPrismaClient({
      databaseUrl: 'postgresql://wintel:wintel@localhost:5433/does-not-exist?schema=public',
    });

    await expect(client.$queryRaw`SELECT 1`).rejects.toThrow();
  });
});
