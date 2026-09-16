import { resolveTxt as nodeResolveTxt } from 'node:dns/promises';

import type { WebsiteVerifyJob } from '@wintel/types';

import type { VerificationStrategy } from './verification-strategy';

type ResolveTxt = (hostname: string) => Promise<string[][]>;

/**
 * DNS answered definitively: the name does not exist, or it exists with no TXT records. Either way
 * the token is not published, so the check completed with a `false` — retrying cannot change it.
 */
const DEFINITIVE_ABSENCE_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

function isDefinitiveAbsence(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    DEFINITIVE_ABSENCE_CODES.has(error.code)
  );
}

/**
 * Confirms ownership by looking for `wintel-verify=<token>` in the domain's TXT records. A lookup
 * that succeeds but lacks the token — or that comes back NXDOMAIN/ENODATA — is a definite `false`.
 * Only a transient fault (SERVFAIL, timeout, refused) throws, so BullMQ retries just those.
 */
export class DnsVerificationStrategy implements VerificationStrategy {
  constructor(private readonly resolveTxt: ResolveTxt = nodeResolveTxt) {}

  async verify(job: WebsiteVerifyJob): Promise<boolean> {
    let records: string[][];

    try {
      records = await this.resolveTxt(job.domain);
    } catch (error) {
      if (isDefinitiveAbsence(error)) {
        return false;
      }
      throw error;
    }

    const expected = `wintel-verify=${job.token}`;

    return records.some((chunks) => chunks.join('') === expected);
  }
}
