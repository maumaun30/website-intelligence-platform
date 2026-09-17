import { load } from 'cheerio';

export interface PageFacts {
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  hasCanonical: boolean;
  robotsContent: string | null;
}

function clean(value: string | undefined): string | null {
  const collapsed = (value ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

/**
 * The handful of facts the rules need from a page's HTML. Extracted once per page so the HTML
 * itself can be dropped immediately — rules never see markup.
 */
export function extractPageFacts(html: string): PageFacts {
  const $ = load(html);
  const metaContent = (name: string) =>
    $('meta[name]')
      .filter((_index, element) => ($(element).attr('name') ?? '').toLowerCase() === name)
      .first()
      .attr('content');

  return {
    title: clean($('title').first().text()),
    metaDescription: clean(metaContent('description')),
    h1Count: $('h1').length,
    hasCanonical: clean($('link[rel="canonical"]').first().attr('href')) !== null,
    robotsContent: clean(metaContent('robots')),
  };
}
