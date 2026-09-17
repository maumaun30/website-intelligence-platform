import type { ScanAuditJob } from '@wintel/types';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { ScanAuditQueueService } from './scan-audit-queue.service';

describe('ScanAuditQueueService', () => {
  it('adds the job under the "audit" name with retries disabled', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new ScanAuditQueueService({ add } as unknown as Queue<ScanAuditJob>);

    await service.enqueue({ auditId: 'a1', scanId: 's1' });

    expect(add).toHaveBeenCalledWith('audit', { auditId: 'a1', scanId: 's1' }, { attempts: 1 });
  });
});
