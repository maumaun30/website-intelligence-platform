import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EXPLAIN_ISSUE_QUEUE } from '@wintel/types';

import { AuditsModule } from '../audits/audits.module';
import { ExplainIssueQueueService } from './explain-issue-queue.service';
import { ExplanationsController } from './explanations.controller';
import { ExplanationsRepository } from './explanations.repository';
import { ExplanationsService } from './explanations.service';

/** On-demand AI explanations: gating, caps, and the producer for the worker. */
@Module({
  imports: [AuditsModule, BullModule.registerQueue({ name: EXPLAIN_ISSUE_QUEUE })],
  controllers: [ExplanationsController],
  providers: [ExplanationsService, ExplanationsRepository, ExplainIssueQueueService],
})
export class ExplanationsModule {}
