import { load } from 'cheerio';

import { canonicalizeUrl } from './url';

export interface ParsedHtml {
  title: string | null;
  links: string[];
}

/**
 * `<base href>` is resolved but deliberately not canonicalized: its trailing slash is what makes
 * `intro` resolve to `/docs/intro` rather than `/intro`.
 */
function resolveBase(baseHref: string | undefined, pageUrl: string): string {
  if (baseHref === undefined) {
    return pageUrl;
  }
  try {
    const resolved = new URL(baseHref, pageUrl);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.toString()
      : pageUrl;
  } catch {
    return pageUrl;
  }
}

/** Extracts what the crawl needs from a page: its title and the http(s) links it points at. */
export function parseHtml(html: string, pageUrl: string): ParsedHtml {
  const $ = load(html);

  const base = resolveBase($('base[href]').first().attr('href'), pageUrl);

  const rawTitle = $('title').first().text().replace(/\s+/g, ' ').trim();

  const links: string[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href');
    const url = href === undefined ? null : canonicalizeUrl(href, base);
    if (url !== null && !seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
  });

  return { title: rawTitle.length > 0 ? rawTitle : null, links };
}
