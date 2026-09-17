/**
 * One canonical spelling per page, so the visited set and the `[scanId, url]` unique key agree on
 * what "the same URL" means. The query string is kept: `?page=2` is a different page.
 */
export function canonicalizeUrl(raw: string, base?: string): string | null {
  let parsed: URL;
  try {
    parsed = base === undefined ? new URL(raw) : new URL(raw, base);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  parsed.hash = '';
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  // WHATWG URL already lowercases the host and drops default ports.
  return parsed.toString();
}

function bareHost(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** A crawl stays on the verified host; `www.` is treated as the same site, subdomains are not. */
export function isSameSite(url: string, domain: string): boolean {
  try {
    return bareHost(new URL(url).hostname) === bareHost(domain.toLowerCase());
  } catch {
    return false;
  }
}

/** Prefix rules from the scan config. Excludes always win; an empty include list allows all. */
export function isPathAllowed(
  path: string,
  includePaths: string[],
  excludePaths: string[],
): boolean {
  if (excludePaths.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  return includePaths.length === 0 || includePaths.some((prefix) => path.startsWith(prefix));
}
