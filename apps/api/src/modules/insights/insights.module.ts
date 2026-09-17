import { Module } from '@nestjs/common';

import { WebsitesModule } from '../websites/websites.module';
import { InsightsController } from './insights.controller';
import { InsightsRepository } from './insights.repository';
import { InsightsService } from './insights.service';

/** Read-only insight endpoints: trends and the organization overview. */
@Module({
  imports: [WebsitesModule],
  controllers: [InsightsController],
  providers: [InsightsService, InsightsRepository],
})
export class InsightsModule {}
