/**
 * Which addresses the crawler must never reach.
 *
 * The platform fetches URLs that users supply, from inside our own network. Without this, anyone
 * could register `http://169.254.169.254/` or a private address, have the worker fetch it, and
 * read the response back out of the scan's stored pages — server-side request forgery, with the
 * product's own storage as the exfiltration channel.
 *
 * Pure and dependency-free so it can be exercised exhaustively; the DNS resolution that feeds it
 * lives in the worker.
 */

/** Hostname suffixes that never name a public host, whatever DNS happens to say today. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number.parseInt(part, 10) : Number.NaN,
  );
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function isBlockedIpv4(octets: number[]): boolean {
  const [a, b] = octets as [number, number, number, number];

  return (
    a === 0 || // "this network"
    a === 10 || // RFC 1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata at 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 0) || // IETF protocol assignments and TEST-NET-1
    (a === 192 && b === 88) || // 6to4 relay anycast
    (a === 192 && b === 168) || // RFC 1918
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51) || // TEST-NET-2
    (a === 203 && b === 0) || // TEST-NET-3
    a >= 224 // multicast, reserved, and 255.255.255.255
  );
}

/** Expands an IPv6 literal to its eight groups, or null when it is not one. */
function parseIpv6(value: string): number[] | null {
  const trimmed = value.replace(/^\[/, '').replace(/\]$/, '');
  if (!trimmed.includes(':')) {
    return null;
  }

  const [head, tail, ...rest] = trimmed.split('::');
  if (rest.length > 0) {
    return null;
  }

  const expand = (part: string | undefined): number[] | null => {
    if (part === undefined || part === '') {
      return [];
    }
    const groups: number[] = [];
    for (const piece of part.split(':')) {
      // A trailing IPv4 literal, as in ::ffff:127.0.0.1, occupies two groups.
      const embedded = parseIpv4(piece);
      if (embedded) {
        groups.push((embedded[0]! << 8) | embedded[1]!, (embedded[2]! << 8) | embedded[3]!);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) {
        return null;
      }
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };

  const left = expand(head);
  const right = tail === undefined ? [] : expand(tail);
  if (left === null || right === null) {
    return null;
  }

  if (tail === undefined) {
    return left.length === 8 ? left : null;
  }

  const gap = 8 - left.length - right.length;
  return gap < 1 ? null : [...left, ...Array.from({ length: gap }, () => 0), ...right];
}

function isBlockedIpv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6] = groups as number[];

  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) both reach an IPv4 destination, so
  // they are judged as that address rather than as IPv6.
  const mapped = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff;
  const nat64 = g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if (mapped || nat64) {
    const embedded = [g6! >> 8, g6! & 0xff, groups[7]! >> 8, groups[7]! & 0xff];
    return isBlockedIpv4(embedded);
  }

  if (groups.every((group) => group === 0)) {
    return true; // unspecified ::
  }
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true; // loopback ::1
  }

  const first = g0!;
  return (
    (first & 0xfe00) === 0xfc00 || // unique-local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast ff00::/8
    first === 0x100 || // discard-only 100::/64
    first === 0x2002 // 6to4, which can carry an embedded private v4
  );
}

/**
 * True when an IP address must not be fetched. Anything unparsable is blocked: a guard that
 * cannot understand an address has no basis for allowing it.
 */
export function isBlockedAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4) {
    return isBlockedIpv4(ipv4);
  }
  const ipv6 = parseIpv6(address);
  if (ipv6) {
    return isBlockedIpv6(ipv6);
  }
  return true;
}

/**
 * True when a hostname can be refused without asking DNS: a name reserved for this machine or a
 * local network, or a literal address that is already out of bounds. A name that passes here
 * still has to survive resolution — this only catches what is knowable up front.
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (host === '') {
    return true;
  }
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  // Only judge it as an address when it actually is one; ordinary names resolve later.
  const looksLikeIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const looksLikeIpv6 = host.startsWith('[') || host.includes(':');
  return looksLikeIpv4 || looksLikeIpv6 ? isBlockedAddress(host) : false;
}
