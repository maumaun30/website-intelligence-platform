import { describe, expect, it } from 'vitest';

import { extractPageFacts } from './page-facts';

describe('extractPageFacts', () => {
  it('extracts title, description, h1 count, canonical and robots', () => {
    const html = `<html><head>
      <title>  Acme   Home </title>
      <meta name="Description" content=" The best acme ">
      <link rel="canonical" href="https://acme.test/">
      <meta name="robots" content="NOINDEX, follow">
    </head><body><h1>A</h1><h1>B</h1></body></html>`;

    expect(extractPageFacts(html)).toEqual({
      title: 'Acme Home',
      metaDescription: 'The best acme',
      h1Count: 2,
      hasCanonical: true,
      robotsContent: 'NOINDEX, follow',
    });
  });

  it('treats empty values and href-less canonicals as absent', () => {
    const html =
      '<title> </title><meta name="description" content=""><link rel="canonical"><p>no heading</p>';

    expect(extractPageFacts(html)).toEqual({
      title: null,
      metaDescription: null,
      h1Count: 0,
      hasCanonical: false,
      robotsContent: null,
    });
  });
});
