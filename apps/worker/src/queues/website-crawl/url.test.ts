import { describe, expect, it } from 'vitest';

import { canonicalizeUrl, isPathAllowed, isSameSite } from './url';

describe('canonicalizeUrl', () => {
  it('resolves relative and protocol-relative links against the base', () => {
    expect(canonicalizeUrl('about', 'https://acme.test/team/')).toBe(
      'https://acme.test/team/about',
    );
    expect(canonicalizeUrl('/pricing', 'https://acme.test/team/')).toBe(
      'https://acme.test/pricing',
    );
    expect(canonicalizeUrl('//cdn.acme.test/x', 'https://acme.test/')).toBe(
      'https://cdn.acme.test/x',
    );
  });

  it('drops the fragment, lowercases the host, and removes the default port', () => {
    expect(canonicalizeUrl('HTTPS://ACME.test:443/Docs#intro')).toBe('https://acme.test/Docs');
    expect(canonicalizeUrl('http://acme.test:80/')).toBe('http://acme.test/');
  });

  it('strips a trailing slash except at the root, and keeps the query', () => {
    expect(canonicalizeUrl('https://acme.test/blog/')).toBe('https://acme.test/blog');
    expect(canonicalizeUrl('https://acme.test/')).toBe('https://acme.test/');
    expect(canonicalizeUrl('https://acme.test')).toBe('https://acme.test/');
    expect(canonicalizeUrl('https://acme.test/search/?q=a')).toBe('https://acme.test/search?q=a');
  });

  it('rejects non-http schemes and garbage', () => {
    expect(canonicalizeUrl('mailto:hi@acme.test')).toBeNull();
    expect(canonicalizeUrl('javascript:void(0)', 'https://acme.test/')).toBeNull();
    expect(canonicalizeUrl('ht!tp://')).toBeNull();
  });
});

describe('isSameSite', () => {
  it('matches the registered host and its www variant only', () => {
    expect(isSameSite('https://acme.test/a', 'acme.test')).toBe(true);
    expect(isSameSite('https://www.acme.test/a', 'acme.test')).toBe(true);
    expect(isSameSite('https://acme.test/a', 'www.acme.test')).toBe(true);
    expect(isSameSite('https://blog.acme.test/a', 'acme.test')).toBe(false);
    expect(isSameSite('https://acme.test.evil/a', 'acme.test')).toBe(false);
  });
});

describe('isPathAllowed', () => {
  it('allows everything when both lists are empty', () => {
    expect(isPathAllowed('/anything', [], [])).toBe(true);
  });

  it('requires an include prefix when includes are given', () => {
    expect(isPathAllowed('/blog/post', ['/blog'], [])).toBe(true);
    expect(isPathAllowed('/shop', ['/blog'], [])).toBe(false);
  });

  it('lets excludes win over includes', () => {
    expect(isPathAllowed('/blog/drafts/x', ['/blog'], ['/blog/drafts'])).toBe(false);
  });
});
