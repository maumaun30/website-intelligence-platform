import { resolveTxt as nodeResolveTxt } from 'node:dns/promises';

import type { WebsiteVerifyJob } from '@wintel/types';

import type { VerificationStrategy } from './verification-strategy';

type ResolveTxt = (hostname: string) => Promise<string[][]>;

/**
 * Confirms ownership by looking for `wintel-verify=<token>` in the domain's TXT records. A DNS
 * lookup that fails (server error, timeout) throws so BullMQ retries; a lookup that succeeds but
 * lacks the token is a definite `false`.
 */
export class DnsVerificationStrategy implements VerificationStrategy {
  constructor(private readonly resolveTxt: ResolveTxt = nodeResolveTxt) {}

  async verify(job: WebsiteVerifyJob): Promise<boolean> {
    const records = await this.resolveTxt(job.domain);
    const expected = `wintel-verify=${job.token}`;

    return records.some((chunks) => chunks.join('') === expected);
  }
}
