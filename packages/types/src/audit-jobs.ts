import { z } from 'zod';

/** Name of the queue carrying audit jobs. The crawl processor and the API produce; the worker consumes. */
export const SCAN_AUDIT_QUEUE = 'scan-audit';

/** A queued or running audit untouched for this long has lost its job and may be re-queued. */
export const AUDIT_STALE_MS = 10 * 60 * 1000;

export const scanAuditJobSchema = z.object({
  auditId: z.string(),
  scanId: z.string(),
});

export type ScanAuditJob = z.infer<typeof scanAuditJobSchema>;
