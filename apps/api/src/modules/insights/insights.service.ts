import { Injectable } from '@nestjs/common';
import type { TrendQuery } from '@wintel/types';

import { WebsitesService } from '../websites/websites.service';
import { InsightsRepository } from './insights.repository';

type Scored = { name: string; score: number | null };

/** Worst health first — the overview answers "what needs attention"; unscored sites sink. */
export function sortOverview<T extends Scored>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.score === null || b.score === null) {
      return a.score === b.score ? a.name.localeCompare(b.name) : a.score === null ? 1 : -1;
    }
    return a.score - b.score || a.name.localeCompare(b.name);
  });
}

@Injectable()
export class InsightsService {
  constructor(
    private readonly repo: InsightsRepository,
    private readonly websites: WebsitesService,
  ) {}

  async trend(websiteId: string, organizationId: string, query: TrendQuery) {
    await this.websites.getOrThrow(websiteId, organizationId);
    return this.repo.trend(websiteId, organizationId, query.limit);
  }

  async overview(organizationId: string) {
    return sortOverview(await this.repo.overview(organizationId));
  }
}
