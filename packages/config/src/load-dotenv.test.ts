import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadDotenv } from './load-dotenv';

describe('loadDotenv', () => {
  let workDir: string;
  let resolvedDir: string;
  const originalCwd = process.cwd();
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'wintel-dotenv-'));
    process.chdir(workDir);
    // macOS symlinks /var to /private/var, so loadDotenv resolves paths against
    // the realpath cwd. Assert against that, not the pre-realpath mkdtemp path.
    resolvedDir = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envSnapshot);
  });

  it('loads variables from an existing file and returns its absolute path', () => {
    writeFileSync(join(workDir, '.env'), 'WINTEL_TEST_LOADED=from-file\n');

    const loaded = loadDotenv(['.env']);

    expect(process.env.WINTEL_TEST_LOADED).toBe('from-file');
    expect(loaded).toEqual([join(resolvedDir, '.env')]);
  });

  it('skips missing files silently and returns an empty array when none exist', () => {
    const loaded = loadDotenv(['.env', '../../.env']);

    expect(loaded).toEqual([]);
  });

  it('does not override a variable already present in process.env', () => {
    process.env.WINTEL_TEST_PRESET = 'from-environment';
    writeFileSync(join(workDir, '.env'), 'WINTEL_TEST_PRESET=from-file\n');

    loadDotenv(['.env']);

    expect(process.env.WINTEL_TEST_PRESET).toBe('from-environment');
  });

  it('returns loaded paths in candidate order, most specific first', () => {
    writeFileSync(join(workDir, '.env'), 'WINTEL_TEST_A=1\n');
    writeFileSync(join(workDir, '.env.local'), 'WINTEL_TEST_B=2\n');

    const loaded = loadDotenv(['.env', '.env.local']);

    expect(loaded).toEqual([join(resolvedDir, '.env'), join(resolvedDir, '.env.local')]);
  });
});
