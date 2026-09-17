import { describe, expect, it } from 'vitest';

import { parseHtml } from './html-parser';

describe('parseHtml', () => {
  it('extracts the title and canonical, de-duplicated links in order', () => {
    const html = `
      <html><head><title>  Acme  Home </title></head><body>
        <a href="/about">About</a>
        <a href="/about/#team">Team</a>
        <a href="https://other.test/x">Other</a>
        <a href="mailto:hi@acme.test">Mail</a>
        <a>No href</a>
      </body></html>`;

    expect(parseHtml(html, 'https://acme.test/')).toEqual({
      title: 'Acme Home',
      links: ['https://acme.test/about', 'https://other.test/x'],
    });
  });

  it('resolves links against <base href>', () => {
    const html = '<base href="https://acme.test/docs/"><a href="intro">Intro</a>';

    expect(parseHtml(html, 'https://acme.test/').links).toEqual(['https://acme.test/docs/intro']);
  });

  it('returns a null title and survives malformed markup', () => {
    expect(parseHtml('<a href="/x"><div></a', 'https://acme.test/')).toEqual({
      title: null,
      links: ['https://acme.test/x'],
    });
  });
});
