import { describe, expect, it } from 'vitest';

import { normalizeWebsiteUrl } from './normalize-url';

describe('normalizeWebsiteUrl', () => {
  it('lowercases the host and derives the domain', () => {
    expect(normalizeWebsiteUrl('https://ACME.test')).toEqual({
      url: 'https://acme.test',
      domain: 'acme.test',
    });
  });

  it('preserves a non-root path', () => {
    expect(normalizeWebsiteUrl('https://acme.test/blog')).toEqual({
      url: 'https://acme.test/blog',
      domain: 'acme.test',
    });
  });

  it('strips a default https port', () => {
    expect(normalizeWebsiteUrl('https://acme.test:443/')).toEqual({
      url: 'https://acme.test',
      domain: 'acme.test',
    });
  });

  it('throws on a non-http(s) scheme', () => {
    expect(() => normalizeWebsiteUrl('ftp://acme.test')).toThrow();
  });
});
