import { describe, expect, it, vi } from 'vitest';

import { ALLOW_ALL, loadRobotsTxt, parseRobotsTxt } from './robots-txt';

describe('parseRobotsTxt', () => {
  it('applies the wildcard group when no specific group matches', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /private\n', 'wintelbot');

    expect(rules.isAllowed('/private/x')).toBe(false);
    expect(rules.isAllowed('/public')).toBe(true);
  });

  it('prefers a group naming our bot over the wildcard', () => {
    const text = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: WintelBot',
      'Disallow: /admin',
      'Crawl-delay: 2',
    ].join('\n');
    const rules = parseRobotsTxt(text, 'wintelbot');

    expect(rules.isAllowed('/blog')).toBe(true);
    expect(rules.isAllowed('/admin/users')).toBe(false);
    expect(rules.crawlDelayMs).toBe(2000);
  });

  it('lets the longest matching rule win, with Allow winning ties', () => {
    const text = 'User-agent: *\nDisallow: /docs\nAllow: /docs/public\nAllow: /x\nDisallow: /x\n';
    const rules = parseRobotsTxt(text, 'wintelbot');

    expect(rules.isAllowed('/docs/internal')).toBe(false);
    expect(rules.isAllowed('/docs/public/page')).toBe(true);
    expect(rules.isAllowed('/x')).toBe(true);
  });

  it('supports * wildcards and the $ end anchor', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /*.pdf$\n', 'wintelbot');

    expect(rules.isAllowed('/files/report.pdf')).toBe(false);
    expect(rules.isAllowed('/files/report.pdf?download=1')).toBe(true);
  });

  it('treats an empty Disallow as allow-all and ignores comments', () => {
    const rules = parseRobotsTxt('# hi\nUser-agent: *\nDisallow:\n', 'wintelbot');

    expect(rules.isAllowed('/anything')).toBe(true);
  });

  it('shares rules across stacked user-agent lines', () => {
    const rules = parseRobotsTxt(
      'User-agent: a\nUser-agent: wintelbot\nDisallow: /b\n',
      'wintelbot',
    );

    expect(rules.isAllowed('/b')).toBe(false);
  });
});

describe('loadRobotsTxt', () => {
  it('parses a 200 response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('User-agent: *\nDisallow: /x\n'));

    const rules = await loadRobotsTxt('https://acme.test', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith('https://acme.test/robots.txt', expect.anything());
    expect(rules.isAllowed('/x')).toBe(false);
  });

  it('allows everything on a 404 or a network error', async () => {
    const notFound = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    const broken = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    expect(await loadRobotsTxt('https://acme.test', notFound)).toBe(ALLOW_ALL);
    expect(await loadRobotsTxt('https://acme.test', broken)).toBe(ALLOW_ALL);
  });
});
