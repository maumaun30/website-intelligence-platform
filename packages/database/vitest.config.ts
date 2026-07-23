import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Integration tests share one Postgres database; running them in parallel across
    // processes would make the migration assertions racy.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
