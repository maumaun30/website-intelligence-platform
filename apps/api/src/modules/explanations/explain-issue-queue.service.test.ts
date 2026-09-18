import type { ExplainIssueJob } from '@wintel/types';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { ExplainIssueQueueService } from './explain-issue-queue.service';

describe('ExplainIssueQueueService', () => {
  it('adds the job with one retry and exponential backoff', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new ExplainIssueQueueService({ add } as unknown as Queue<ExplainIssueJob>);

    await service.enqueue({ explanationId: 'e1' });

    expect(add).toHaveBeenCalledWith(
      'explain',
      { explanationId: 'e1' },
      { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
    );
  });
});
