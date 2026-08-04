import { describe, expect, it } from 'vitest';

import {
  createWebsiteInputSchema,
  updateWebsiteInputSchema,
  verifyWebsiteInputSchema,
} from './website';

describe('createWebsiteInputSchema', () => {
  it('accepts a name and an http(s) url', () => {
    const parsed = createWebsiteInputSchema.safeParse({ name: 'Acme', url: 'https://acme.test' });
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-http(s) url', () => {
    const parsed = createWebsiteInputSchema.safeParse({ name: 'Acme', url: 'ftp://acme.test' });
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const parsed = createWebsiteInputSchema.safeParse({ name: '', url: 'https://acme.test' });
    expect(parsed.success).toBe(false);
  });
});

describe('updateWebsiteInputSchema', () => {
  it('accepts a partial scan-config update', () => {
    const parsed = updateWebsiteInputSchema.safeParse({ maxDepth: 5, respectRobotsTxt: false });
    expect(parsed.success).toBe(true);
  });

  it('rejects maxDepth above the cap', () => {
    expect(updateWebsiteInputSchema.safeParse({ maxDepth: 99 }).success).toBe(false);
  });

  it('rejects maxPages below 1', () => {
    expect(updateWebsiteInputSchema.safeParse({ maxPages: 0 }).success).toBe(false);
  });
});

describe('verifyWebsiteInputSchema', () => {
  it('accepts a known method', () => {
    expect(verifyWebsiteInputSchema.safeParse({ method: 'dns' }).success).toBe(true);
  });

  it('rejects an unknown method', () => {
    expect(verifyWebsiteInputSchema.safeParse({ method: 'carrier-pigeon' }).success).toBe(false);
  });
});
