/**
 * Canonicalizes a website URL and extracts its host. The crawler needs the URL; DNS verification
 * needs the bare host. Rejects anything that is not http(s) so a bad scheme fails at the boundary
 * rather than deep in a fetch or a DNS lookup.
 */
export function normalizeWebsiteUrl(input: string): { url: string; domain: string } {
  const parsed = new URL(input);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  parsed.search = '';

  // A bare root ("/") is noise; anything deeper is meaningful and kept.
  let url = parsed.toString();
  if (parsed.pathname === '/') {
    url = url.replace(/\/$/, '');
  }

  return { url, domain: parsed.hostname };
}
