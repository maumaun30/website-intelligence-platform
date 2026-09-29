import { lookup as dnsLookup } from 'node:dns/promises';

import { isBlockedAddress, isBlockedHostname } from '@wintel/types';

/** Refused before a request is made, so it never reaches the network. */
export class BlockedTargetError extends Error {
  constructor(url: string, reason: string) {
    super(`Refusing to fetch ${url}: ${reason}`);
    this.name = 'BlockedTargetError';
  }
}

export interface GuardedFetchOptions {
  /** Development only. Lets the crawler reach localhost so a local test site can be scanned. */
  allowPrivateTargets: boolean;
  lookup?: (hostname: string) => Promise<string[]>;
  fetchFn?: typeof fetch;
}

async function resolveAll(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((record) => record.address);
}

/**
 * `fetch`, with the destination checked first.
 *
 * The platform fetches URLs its users supply, from inside our own network, so an unguarded fetch
 * is server-side request forgery waiting to happen: a website registered as a private or
 * link-local address would be fetched from within the network and its response stored where the
 * user can read it back.
 *
 * Wrapping `fetch` rather than checking at each call site means every caller is covered by
 * construction — including each hop of the crawler's redirect loop, which re-enters this function
 * with the new URL.
 *
 * Known limit: a name resolved here could resolve differently when the connection is made (DNS
 * rebinding). Closing that needs the socket pinned to the address that was checked, which Node's
 * fetch does not expose. Every address a name answers with must pass, which removes the cheap
 * version of the attack.
 */
export function createGuardedFetch(options: GuardedFetchOptions): typeof fetch {
  const lookup = options.lookup ?? resolveAll;
  const inner = options.fetchFn ?? fetch;

  return async function guardedFetch(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const parsed = new URL(url);

    // Not negotiable, even in development: file: and friends never name a website.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BlockedTargetError(url, `scheme ${parsed.protocol} is not allowed`);
    }

    if (options.allowPrivateTargets) {
      return inner(input, init);
    }

    if (isBlockedHostname(parsed.hostname)) {
      throw new BlockedTargetError(url, 'host is a local or reserved name');
    }

    const addresses = await lookup(parsed.hostname.replace(/^\[|\]$/g, ''));
    if (addresses.length === 0) {
      throw new BlockedTargetError(url, 'host does not resolve');
    }

    // Every answer must pass: a name that returns one public and one private address is the
    // ordinary way past a check that only looks at the first.
    const blocked = addresses.find((address) => isBlockedAddress(address));
    if (blocked !== undefined) {
      throw new BlockedTargetError(url, `host resolves to ${blocked}, which is not public`);
    }

    return inner(input, init);
  };
}
