import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InsightsService, sortOverview } from './insights.service';

const row = (name: string, score: number | null) => ({ websiteId: name, name, score });

describe('sortOverview', () => {
  it('puts the worst scores first, unscored last, ties by name', () => {
    const sorted = sortOverview([
      row('b', 90),
      row('a', null),
      row('c', 40),
      row('d', 90),
    ] as never);

    expect(sorted.map((entry) => entry.name)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('InsightsService', () => {
  it('checks website ownership before reading the trend', async () => {
    const repo = { trend: vi.fn().mockResolvedValue([]), overview: vi.fn() };
    const websites = { getOrThrow: vi.fn().mockRejectedValue(new NotFoundException()) };
    const service = new InsightsService(repo as never, websites as never);

    await expect(service.trend('w1', 'o1', { limit: 30 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.trend).not.toHaveBeenCalled();
  });

  it('returns the overview sorted', async () => {
    const repo = {
      trend: vi.fn(),
      overview: vi.fn().mockResolvedValue([row('ok', 95), row('bad', 20)]),
    };
    const service = new InsightsService(repo as never, { getOrThrow: vi.fn() } as never);

    expect((await service.overview('o1')).map((entry) => entry.name)).toEqual(['bad', 'ok']);
  });
});
