# Scan Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start scans of verified daily/weekly websites automatically, once per interval, with the same start rules as manual scans, and show the schedule in the web app.

**Architecture:** `Website.nextScanAt` holds each website's schedule in Postgres. A single BullMQ job scheduler ticks every 60 s; the tick claims due websites by conditionally advancing `nextScanAt`, then starts scans using a shared pure `evaluateScanStart`. The API sets `nextScanAt` when frequency changes; the verify processor sets it on first successful verification.

**Tech Stack:** TypeScript, NestJS 11, Prisma 6, BullMQ 5.80 (`upsertJobScheduler`), Zod 4, Next.js 15, vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-scan-scheduler-design.md`

## Global Constraints

- Prefix every shell command (including `git commit`) with `. ~/.nvm/nvm.sh && nvm use 22 >/dev/null`.
- Tests: `pnpm --filter @wintel/<pkg> exec vitest run [path]`; infra must be up.
- Prisma: `pnpm --filter @wintel/database db:migrate:dev --name <name>` then `pnpm --filter @wintel/database build`. Types: `pnpm --filter @wintel/types build` after changes.
- DI classes are value imports; verify after each commit.
- Constants: `SCAN_INTERVAL_MS.daily = 86_400_000`, `.weekly = 604_800_000`; `SCHEDULER_TICK_MS = 60_000`; `SCHEDULER_BATCH_SIZE = 50`; `SCHEDULER_JOB_ID = 'scan-scheduler-tick'`; queue `scan-scheduler`.
- Crawl jobs: name `crawl`, `{ attempts: 1 }`.
- Manual scans never change `nextScanAt`. Saving the config without changing frequency never changes `nextScanAt`.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SJ3KW2BdV6HozzjAbgPRqy
  ```

---

### Task 1: Schedule columns + migration

**Files:** Modify `packages/database/prisma/schema.prisma`; generated migration `*_add_scan_schedule`.

**Interfaces:** Produces `Website.nextScanAt: Date | null` (indexed), enum `ScanTrigger`, `Scan.trigger` (default `manual`).

- [ ] **Step 1:** In `Website` add `nextScanAt DateTime?` after `respectRobotsTxt`, and `@@index([nextScanAt])` next to its other indexes. In `Scan` add `trigger ScanTrigger @default(manual)` after `status`. Add:

```prisma
enum ScanTrigger {
  manual
  scheduled
}
```

- [ ] **Step 2:** Migrate (`--name add_scan_schedule`), build database, typecheck api and worker — green.
- [ ] **Step 3:** Commit `feat(database): add scan schedule and trigger columns`.

---

### Task 2: Schedule helpers and contracts (`@wintel/types`)

**Files:**
- Create: `packages/types/src/schedule.ts`, `packages/types/src/schedule.test.ts`
- Modify: `packages/types/src/scan.ts` (trigger), `packages/types/src/website.ts` (nextScanAt), `packages/types/src/scan.test.ts` (fixture), `packages/types/src/index.ts`

**Interfaces:** Produces `SCAN_TRIGGERS`, `ScanTrigger`, `scanSchema.trigger`, `websiteSchema.nextScanAt`; `SCAN_INTERVAL_MS`, `SCAN_SCHEDULER_QUEUE`, `SCHEDULER_TICK_MS`, `SCHEDULER_BATCH_SIZE`, `SCHEDULER_JOB_ID`, `computeNextScanAt(frequency: ScanFrequency, from: Date): Date | null`, `interface ActiveScanSnapshot { id: string; status: string; startedAt: Date | null }`, `isStaleScan(scan: ActiveScanSnapshot, now: Date): boolean`, `type ScanStartDecision = { action: 'start'; staleScanId: string | null } | { action: 'refuse'; code: ScanStartRefusal }`, `type ScanStartRefusal = 'WEBSITE_NOT_VERIFIED' | 'SCAN_IN_PROGRESS'`, `evaluateScanStart(input: { verificationStatus: string; activeScan: ActiveScanSnapshot | null; now: Date }): ScanStartDecision`.

- [ ] **Step 1: Failing test** — `schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { SCAN_DEADLINE_MS } from './scan-jobs';
import { computeNextScanAt, evaluateScanStart, isStaleScan } from './schedule';

const now = new Date('2026-09-17T12:00:00.000Z');

describe('computeNextScanAt', () => {
  it('adds one day or one week, and turns scheduling off for manual', () => {
    expect(computeNextScanAt('daily', now)?.toISOString()).toBe('2026-09-18T12:00:00.000Z');
    expect(computeNextScanAt('weekly', now)?.toISOString()).toBe('2026-09-24T12:00:00.000Z');
    expect(computeNextScanAt('manual', now)).toBeNull();
  });
});

describe('isStaleScan', () => {
  it('treats only a running scan past the deadline as stale', () => {
    const old = new Date(now.getTime() - SCAN_DEADLINE_MS - 1);

    expect(isStaleScan({ id: 's', status: 'running', startedAt: old }, now)).toBe(true);
    expect(isStaleScan({ id: 's', status: 'running', startedAt: now }, now)).toBe(false);
    expect(isStaleScan({ id: 's', status: 'queued', startedAt: null }, now)).toBe(false);
  });
});

describe('evaluateScanStart', () => {
  it('refuses unverified websites before anything else', () => {
    expect(
      evaluateScanStart({ verificationStatus: 'pending', activeScan: null, now }),
    ).toEqual({ action: 'refuse', code: 'WEBSITE_NOT_VERIFIED' });
  });

  it('starts when nothing is active', () => {
    expect(evaluateScanStart({ verificationStatus: 'verified', activeScan: null, now })).toEqual({
      action: 'start',
      staleScanId: null,
    });
  });

  it('refuses while a live scan is active', () => {
    const activeScan = { id: 's0', status: 'queued', startedAt: null };

    expect(evaluateScanStart({ verificationStatus: 'verified', activeScan, now })).toEqual({
      action: 'refuse',
      code: 'SCAN_IN_PROGRESS',
    });
  });

  it('starts and names the stale scan to release', () => {
    const activeScan = {
      id: 's0',
      status: 'running',
      startedAt: new Date(now.getTime() - SCAN_DEADLINE_MS - 1),
    };

    expect(evaluateScanStart({ verificationStatus: 'verified', activeScan, now })).toEqual({
      action: 'start',
      staleScanId: 's0',
    });
  });
});
```

- [ ] **Step 2:** Run — fail.

- [ ] **Step 3: Implement `schedule.ts`**

```ts
import { SCAN_DEADLINE_MS } from './scan-jobs';
import type { ScanFrequency } from './website';

/** How long after one scheduled scan the next one is due. */
export const SCAN_INTERVAL_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;

export const SCAN_SCHEDULER_QUEUE = 'scan-scheduler';
export const SCHEDULER_JOB_ID = 'scan-scheduler-tick';
export const SCHEDULER_TICK_MS = 60 * 1000;
export const SCHEDULER_BATCH_SIZE = 50;

export function computeNextScanAt(frequency: ScanFrequency, from: Date): Date | null {
  return frequency === 'manual' ? null : new Date(from.getTime() + SCAN_INTERVAL_MS[frequency]);
}

export interface ActiveScanSnapshot {
  id: string;
  status: string;
  startedAt: Date | null;
}

/**
 * A `running` scan older than the worker's own deadline has lost its worker and must not block new
 * scans. A `queued` scan is never stale: it may be waiting behind other websites' crawls.
 */
export function isStaleScan(scan: ActiveScanSnapshot, now: Date): boolean {
  return (
    scan.status === 'running' &&
    scan.startedAt !== null &&
    now.getTime() - scan.startedAt.getTime() > SCAN_DEADLINE_MS
  );
}

export type ScanStartRefusal = 'WEBSITE_NOT_VERIFIED' | 'SCAN_IN_PROGRESS';

export type ScanStartDecision =
  | { action: 'start'; staleScanId: string | null }
  | { action: 'refuse'; code: ScanStartRefusal };

/**
 * Whether a scan may start, shared by manual starts (API) and scheduled starts (worker) so the two
 * can never disagree. The caller performs the database work the decision implies.
 */
export function evaluateScanStart(input: {
  verificationStatus: string;
  activeScan: ActiveScanSnapshot | null;
  now: Date;
}): ScanStartDecision {
  if (input.verificationStatus !== 'verified') {
    return { action: 'refuse', code: 'WEBSITE_NOT_VERIFIED' };
  }
  if (input.activeScan === null) {
    return { action: 'start', staleScanId: null };
  }
  return isStaleScan(input.activeScan, input.now)
    ? { action: 'start', staleScanId: input.activeScan.id }
    : { action: 'refuse', code: 'SCAN_IN_PROGRESS' };
}
```

- [ ] **Step 4: Trigger + nextScanAt in schemas.** In `scan.ts` add `export const SCAN_TRIGGERS = ['manual', 'scheduled'] as const;`, add `trigger: z.enum(SCAN_TRIGGERS),` to `scanSchema` after `status`, and `export type ScanTrigger = (typeof SCAN_TRIGGERS)[number];`. In `website.ts` add `nextScanAt: z.string().nullable(),` to `websiteSchema` after `respectRobotsTxt`. In `scan.test.ts` add `trigger: 'scheduled',` to the completed-scan fixture.

- [ ] **Step 5: Barrel.** Add `SCAN_TRIGGERS` to the `./scan` value export and `ScanTrigger` to its type export. Append:

```ts
export {
  SCAN_INTERVAL_MS,
  SCAN_SCHEDULER_QUEUE,
  SCHEDULER_BATCH_SIZE,
  SCHEDULER_JOB_ID,
  SCHEDULER_TICK_MS,
  computeNextScanAt,
  evaluateScanStart,
  isStaleScan,
} from './schedule';
export type { ActiveScanSnapshot, ScanStartDecision, ScanStartRefusal } from './schedule';
```

- [ ] **Step 6:** Types tests, typecheck, lint, build — green.
- [ ] **Step 7:** Commit `feat(types): add shared scan start rules and schedule helpers`.

---

### Task 3: API — shared start rules and schedule on frequency change

**Files:** Modify `apps/api/src/modules/scans/scans.service.ts`, `apps/api/src/modules/websites/websites.service.ts`, `apps/api/src/modules/websites/websites.service.test.ts`, `apps/api/test/api.e2e.test.ts`.

**Interfaces:** Consumes `evaluateScanStart`, `computeNextScanAt`. Produces `WebsitesService.update(id, organizationId, input, now?: Date)`.

- [ ] **Step 1: Failing service tests** — append inside `describe('WebsitesService')`:

```ts
  describe('scheduling on update', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');

    it('schedules the next scan when the frequency changes to daily', async () => {
      repo.findInOrg.mockResolvedValue({ ...sampleRow, scanFrequency: 'manual' });
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { scanFrequency: 'daily' }, now);

      expect(repo.update).toHaveBeenCalledWith('w1', 'org1', {
        scanFrequency: 'daily',
        nextScanAt: new Date('2026-09-18T12:00:00.000Z'),
      });
    });

    it('turns scheduling off when the frequency becomes manual', async () => {
      repo.findInOrg.mockResolvedValue({ ...sampleRow, scanFrequency: 'weekly' });
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { scanFrequency: 'manual' }, now);

      expect(repo.update).toHaveBeenCalledWith('w1', 'org1', {
        scanFrequency: 'manual',
        nextScanAt: null,
      });
    });

    it('leaves the schedule alone when the frequency is unchanged', async () => {
      repo.findInOrg.mockResolvedValue({ ...sampleRow, scanFrequency: 'daily' });
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { scanFrequency: 'daily', maxDepth: 4 }, now);

      expect(repo.update).toHaveBeenCalledWith('w1', 'org1', { scanFrequency: 'daily', maxDepth: 4 });
    });

    it('does not read the website when the frequency is not part of the update', async () => {
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { name: 'Renamed' }, now);

      expect(repo.findInOrg).not.toHaveBeenCalled();
    });

    it('404s a frequency change for a website outside the org', async () => {
      repo.findInOrg.mockResolvedValue(null);

      await expect(
        service.update('w1', 'org1', { scanFrequency: 'daily' }, now),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2:** Run — fail.

- [ ] **Step 3: Implement `WebsitesService.update`**

Add `computeNextScanAt` to the `@wintel/types` import (keep existing type imports) and replace `update`:

```ts
  async update(id: string, organizationId: string, input: UpdateWebsiteInput, now: Date = new Date()) {
    const data: Prisma.WebsiteUpdateInput = { ...input };

    // Only a real frequency change moves the schedule; re-saving the same config must not postpone it.
    if (input.scanFrequency !== undefined) {
      const current = await this.repo.findInOrg(id, organizationId);
      if (!current) {
        throw new NotFoundException('Website not found');
      }
      if (current.scanFrequency !== input.scanFrequency) {
        data.nextScanAt = computeNextScanAt(input.scanFrequency, now);
      }
    }

    const updated = await this.repo.update(id, organizationId, data);
    if (!updated) {
      throw new NotFoundException('Website not found');
    }
    return updated;
  }
```

- [ ] **Step 4: Refactor `ScansService.start`** — remove the local `ActiveScan` interface and `isStale` function; import `evaluateScanStart` and `type ScanStartRefusal` from `@wintel/types`; add:

```ts
const REFUSAL_MESSAGES: Record<ScanStartRefusal, string> = {
  WEBSITE_NOT_VERIFIED: 'Verify ownership of this website before scanning it',
  SCAN_IN_PROGRESS: 'A scan of this website is already in progress',
};
```

and replace the body of `start` between `getOrThrow` and `createQueued` with:

```ts
    const decision = evaluateScanStart({
      verificationStatus: website.verificationStatus,
      activeScan: await this.repo.findActiveForWebsite(websiteId, organizationId),
      now,
    });

    if (decision.action === 'refuse') {
      throw new ConflictException({
        message: REFUSAL_MESSAGES[decision.code],
        details: { code: decision.code },
      });
    }
    if (decision.staleScanId !== null) {
      await this.repo.markFailed(
        decision.staleScanId,
        organizationId,
        'Scan did not finish before the deadline',
      );
    }
```

Remove `SCAN_DEADLINE_MS` from the scans service import if now unused.

- [ ] **Step 5: E2E** — append to the `scans` describe:

```ts
  it('schedules and unschedules scans when the frequency changes', async () => {
    const daily = await request(app.getHttpServer())
      .patch(`/api/v1/websites/${websiteId}`)
      .set('Cookie', cookie)
      .send({ scanFrequency: 'daily' });
    expect(daily.status).toBe(200);
    expect(typeof daily.body.nextScanAt).toBe('string');

    const manual = await request(app.getHttpServer())
      .patch(`/api/v1/websites/${websiteId}`)
      .set('Cookie', cookie)
      .send({ scanFrequency: 'manual' });
    expect(manual.body.nextScanAt).toBeNull();
  });
```

- [ ] **Step 6:** API suite (all existing scans service tests must still pass unchanged), typecheck, lint, build — green.
- [ ] **Step 7:** Commit `feat(api): share scan start rules and schedule on frequency change`.

---

### Task 4: Worker — first schedule on verification, scheduler tick, registrar

**Files:**
- Modify: `apps/worker/src/queues/website-verify/website-verify.processor.ts`, `website-verify.processor.test.ts`
- Create: `apps/worker/src/queues/scan-scheduler/scan-scheduler.processor.ts`, `scan-scheduler.processor.test.ts`, `scan-scheduler.registrar.ts`, `scan-scheduler.registrar.test.ts`, `scan-scheduler.module.ts`
- Modify: `apps/worker/src/worker.module.ts`

**Interfaces:** Produces `ScanSchedulerProcessor.runTick(now: Date): Promise<{ due: number; started: number; skipped: number; failed: number }>`; `ScanSchedulerRegistrar.onApplicationBootstrap()`.

- [ ] **Step 1: Failing verify tests.** In `website-verify.processor.test.ts` change `makePrisma` to:

```ts
function makePrisma() {
  const update = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });

  return { prisma: { client: { website: { update, updateMany } } }, update, updateMany };
}
```

and append:

```ts
  it('schedules the first scan of a daily or weekly website once verified', async () => {
    const { prisma, updateMany } = makePrisma();
    const dns = { verify: vi.fn().mockResolvedValue(true) };
    const processor = new WebsiteVerifyProcessor(
      prisma as never,
      dns as never,
      { verify: vi.fn() } as never,
      logger as never,
    );

    await processor.process(job('dns'));

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', nextScanAt: null, scanFrequency: 'daily' },
      data: { nextScanAt: expect.any(Date) },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', nextScanAt: null, scanFrequency: 'weekly' },
      data: { nextScanAt: expect.any(Date) },
    });
  });

  it('does not schedule anything when verification fails', async () => {
    const { prisma, updateMany } = makePrisma();
    const dns = { verify: vi.fn().mockResolvedValue(false) };
    const processor = new WebsiteVerifyProcessor(
      prisma as never,
      dns as never,
      { verify: vi.fn() } as never,
      logger as never,
    );

    await processor.process(job('dns'));

    expect(updateMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2:** Run — the two new tests fail.

- [ ] **Step 3: Implement.** In `website-verify.processor.ts` import `computeNextScanAt` from `@wintel/types` and insert after the status update:

```ts
    if (ok) {
      // A newly verified website with a schedule gets its first run; an existing schedule is kept.
      const now = new Date();
      for (const frequency of ['daily', 'weekly'] as const) {
        await this.prisma.client.website.updateMany({
          where: { id: data.websiteId, nextScanAt: null, scanFrequency: frequency },
          data: { nextScanAt: computeNextScanAt(frequency, now) },
        });
      }
    }
```

- [ ] **Step 4:** Run verify tests — pass.

- [ ] **Step 5: Failing scheduler integration test** — `scan-scheduler.processor.test.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { SCAN_DEADLINE_MS } from '@wintel/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScanSchedulerProcessor } from './scan-scheduler.processor';

let prisma: PrismaClient;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const crawlQueue = { add: vi.fn() };
const organizations: string[] = [];
const users: string[] = [];

const NOW = new Date('2026-09-17T12:00:00.000Z');
const PAST = new Date('2000-01-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

async function seedWebsite(overrides: {
  verificationStatus?: 'pending' | 'verified' | 'failed';
  scanFrequency?: 'manual' | 'daily' | 'weekly';
  nextScanAt?: Date | null;
}) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  users.push(userId);
  organizations.push(organizationId);
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` },
  });
  return prisma.website.create({
    data: {
      organizationId,
      createdById: userId,
      name: 'Scheduled',
      url: 'https://scheduled.test',
      domain: `scheduled-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      verificationStatus: overrides.verificationStatus ?? 'verified',
      scanFrequency: overrides.scanFrequency ?? 'daily',
      nextScanAt: overrides.nextScanAt === undefined ? PAST : overrides.nextScanAt,
      excludePaths: ['/admin'],
    },
  });
}

function processor() {
  return new ScanSchedulerProcessor({ client: prisma } as never, crawlQueue as never, logger as never);
}

function crawlJobsFor(websiteId: string) {
  return crawlQueue.add.mock.calls.filter(([, job]) => job.websiteId === websiteId);
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

beforeEach(() => {
  crawlQueue.add.mockReset();
  crawlQueue.add.mockResolvedValue(undefined);
});

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizations.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ScanSchedulerProcessor', () => {
  it('starts a scheduled scan of a due website and advances its schedule', async () => {
    const website = await seedWebsite({});

    await processor().runTick(NOW);

    const scans = await prisma.scan.findMany({ where: { websiteId: website.id } });
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ status: 'queued', trigger: 'scheduled' });
    expect(crawlJobsFor(website.id)).toEqual([
      [
        'crawl',
        {
          scanId: scans[0]!.id,
          websiteId: website.id,
          organizationId: website.organizationId,
          url: website.url,
          domain: website.domain,
          maxDepth: website.maxDepth,
          maxPages: website.maxPages,
          includePaths: [],
          excludePaths: ['/admin'],
          respectRobotsTxt: true,
        },
        { attempts: 1 },
      ],
    ]);
    const reread = await prisma.website.findUniqueOrThrow({ where: { id: website.id } });
    expect(reread.nextScanAt?.getTime()).toBe(NOW.getTime() + DAY);
  });

  it('skips a website with a live scan but still advances its schedule', async () => {
    const website = await seedWebsite({ scanFrequency: 'weekly' });
    await prisma.scan.create({
      data: { websiteId: website.id, organizationId: website.organizationId, status: 'running', startedAt: NOW },
    });

    await processor().runTick(NOW);

    expect(crawlJobsFor(website.id)).toEqual([]);
    const reread = await prisma.website.findUniqueOrThrow({ where: { id: website.id } });
    expect(reread.nextScanAt?.getTime()).toBe(NOW.getTime() + 7 * DAY);
  });

  it('releases a stale running scan and starts a new one', async () => {
    const website = await seedWebsite({});
    const stale = await prisma.scan.create({
      data: {
        websiteId: website.id,
        organizationId: website.organizationId,
        status: 'running',
        startedAt: new Date(NOW.getTime() - SCAN_DEADLINE_MS - 1),
      },
    });

    await processor().runTick(NOW);

    expect((await prisma.scan.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('failed');
    expect(crawlJobsFor(website.id)).toHaveLength(1);
  });

  it('ignores manual, unverified, and not-yet-due websites', async () => {
    const manual = await seedWebsite({ scanFrequency: 'manual', nextScanAt: PAST });
    const unverified = await seedWebsite({ verificationStatus: 'pending' });
    const future = await seedWebsite({ nextScanAt: new Date(NOW.getTime() + 1000) });

    await processor().runTick(NOW);

    for (const website of [manual, unverified, future]) {
      expect(crawlJobsFor(website.id)).toEqual([]);
      const reread = await prisma.website.findUniqueOrThrow({ where: { id: website.id } });
      expect(reread.nextScanAt?.getTime()).toBe(website.nextScanAt?.getTime());
    }
  });

  it('starts nothing when another tick already claimed the website', async () => {
    const website = await seedWebsite({});
    const tick = processor();
    const findMany = prisma.website.findMany.bind(prisma.website);
    const spy = vi.spyOn(prisma.website, 'findMany').mockImplementationOnce(async (args) => {
      const rows = await findMany(args as never);
      await prisma.website.update({
        where: { id: website.id },
        data: { nextScanAt: new Date(NOW.getTime() + DAY) },
      });
      return rows;
    });

    await tick.runTick(NOW);
    spy.mockRestore();

    expect(crawlJobsFor(website.id)).toEqual([]);
    expect(await prisma.scan.count({ where: { websiteId: website.id } })).toBe(0);
  });

  it('keeps going when one website fails to start', async () => {
    const first = await seedWebsite({ nextScanAt: new Date('1999-01-01T00:00:00.000Z') });
    const second = await seedWebsite({});
    crawlQueue.add.mockRejectedValueOnce(new Error('redis down'));

    const summary = await processor().runTick(NOW);

    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(crawlJobsFor(first.id)).toHaveLength(1);
    expect(crawlJobsFor(second.id)).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
```

> The batch-size limit (50) is enforced by `take` and is not given its own integration test: seeding 51 websites would dominate the suite's runtime, and the query is covered by reading it.

- [ ] **Step 6:** Run — fail (module missing).

- [ ] **Step 7: Implement processor**

```ts
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ACTIVE_SCAN_STATUSES,
  SCAN_SCHEDULER_QUEUE,
  SCHEDULER_BATCH_SIZE,
  WEBSITE_CRAWL_QUEUE,
  type WebsiteCrawlJob,
  computeNextScanAt,
  evaluateScanStart,
} from '@wintel/types';
import { Queue } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

type DueWebsite = Awaited<ReturnType<ScanSchedulerProcessor['findDue']>>[number];

export interface TickSummary {
  due: number;
  started: number;
  skipped: number;
  failed: number;
}

/**
 * Starts scheduled scans. Each tick claims due websites by conditionally advancing `nextScanAt` —
 * before deciding whether to scan — so concurrent ticks never double-start and downtime never
 * produces a burst of catch-up scans. Start rules are the shared `evaluateScanStart`.
 */
@Processor(SCAN_SCHEDULER_QUEUE)
export class ScanSchedulerProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEBSITE_CRAWL_QUEUE) private readonly crawlQueue: Queue<WebsiteCrawlJob>,
    @InjectPinoLogger(ScanSchedulerProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(): Promise<TickSummary> {
    return this.runTick(new Date());
  }

  async runTick(now: Date): Promise<TickSummary> {
    const due = await this.findDue(now);
    const summary: TickSummary = { due: due.length, started: 0, skipped: 0, failed: 0 };

    for (const website of due) {
      try {
        if (await this.startScheduledScan(website, now)) {
          summary.started++;
        } else {
          summary.skipped++;
        }
      } catch (error) {
        summary.failed++;
        this.logger.error({ websiteId: website.id, err: error }, 'Could not start a scheduled scan');
      }
    }

    if (summary.due > 0) {
      this.logger.info(summary, 'Scheduler tick');
    }
    return summary;
  }

  findDue(now: Date) {
    return this.prisma.client.website.findMany({
      where: {
        verificationStatus: 'verified',
        scanFrequency: { not: 'manual' },
        nextScanAt: { lte: now },
      },
      orderBy: { nextScanAt: 'asc' },
      take: SCHEDULER_BATCH_SIZE,
    });
  }

  private async startScheduledScan(website: DueWebsite, now: Date): Promise<boolean> {
    const client = this.prisma.client;

    const { count } = await client.website.updateMany({
      where: { id: website.id, nextScanAt: website.nextScanAt },
      data: { nextScanAt: computeNextScanAt(website.scanFrequency, now) },
    });
    if (count === 0) {
      return false;
    }

    const activeScan = await client.scan.findFirst({
      where: { websiteId: website.id, status: { in: [...ACTIVE_SCAN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    const decision = evaluateScanStart({
      verificationStatus: website.verificationStatus,
      activeScan,
      now,
    });
    if (decision.action === 'refuse') {
      return false;
    }
    if (decision.staleScanId !== null) {
      await client.scan.update({
        where: { id: decision.staleScanId },
        data: { status: 'failed', error: 'Scan did not finish before the deadline', finishedAt: now },
      });
    }

    const scan = await client.scan.create({
      data: { websiteId: website.id, organizationId: website.organizationId, trigger: 'scheduled' },
    });
    await this.crawlQueue.add(
      'crawl',
      {
        scanId: scan.id,
        websiteId: website.id,
        organizationId: website.organizationId,
        url: website.url,
        domain: website.domain,
        maxDepth: website.maxDepth,
        maxPages: website.maxPages,
        includePaths: website.includePaths,
        excludePaths: website.excludePaths,
        respectRobotsTxt: website.respectRobotsTxt,
      },
      { attempts: 1 },
    );
    return true;
  }
}
```

- [ ] **Step 8: Registrar — test then implementation**

`scan-scheduler.registrar.test.ts`:

```ts
import { SCHEDULER_JOB_ID, SCHEDULER_TICK_MS } from '@wintel/types';
import { describe, expect, it, vi } from 'vitest';

import { ScanSchedulerRegistrar } from './scan-scheduler.registrar';

describe('ScanSchedulerRegistrar', () => {
  it('upserts one repeating tick on startup', async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    const registrar = new ScanSchedulerRegistrar({ upsertJobScheduler } as never);

    await registrar.onApplicationBootstrap();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      SCHEDULER_JOB_ID,
      { every: SCHEDULER_TICK_MS },
      expect.objectContaining({ name: 'tick' }),
    );
  });
});
```

`scan-scheduler.registrar.ts`:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { SCAN_SCHEDULER_QUEUE, SCHEDULER_JOB_ID, SCHEDULER_TICK_MS } from '@wintel/types';
import { Queue } from 'bullmq';

/**
 * Ensures the scheduler tick exists. `upsertJobScheduler` with a fixed id is idempotent, so every
 * worker can call it on boot and there is still exactly one tick; it also restores the tick after a
 * Redis flush. The schedule itself lives in Postgres.
 */
@Injectable()
export class ScanSchedulerRegistrar implements OnApplicationBootstrap {
  constructor(@InjectQueue(SCAN_SCHEDULER_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SCHEDULER_JOB_ID,
      { every: SCHEDULER_TICK_MS },
      {
        name: 'tick',
        opts: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
      },
    );
  }
}
```

- [ ] **Step 9: Module + registration**

`scan-scheduler.module.ts`:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SCAN_SCHEDULER_QUEUE, WEBSITE_CRAWL_QUEUE } from '@wintel/types';

import { ScanSchedulerProcessor } from './scan-scheduler.processor';
import { ScanSchedulerRegistrar } from './scan-scheduler.registrar';

/** The scheduler tick: registers it, consumes it, and produces crawl jobs for due websites. */
@Module({
  imports: [
    BullModule.registerQueue({ name: SCAN_SCHEDULER_QUEUE }),
    BullModule.registerQueue({ name: WEBSITE_CRAWL_QUEUE }),
  ],
  providers: [ScanSchedulerProcessor, ScanSchedulerRegistrar],
})
export class ScanSchedulerModule {}
```

Register `ScanSchedulerModule` in `worker.module.ts` after `ScanAuditModule`.

- [ ] **Step 10:** Worker suite, typecheck, lint, build — green. Verify DI imports.
- [ ] **Step 11:** Commit `feat(worker): start scheduled scans on a single scheduler tick`.

---

### Task 5: Web — next scan text, scheduled badge, fixtures

**Files:**
- Create: `apps/web/src/lib/schedule-text.ts`, `schedule-text.test.ts`
- Modify: `apps/web/src/components/scan-config-form.tsx`, `scan-panel.tsx`, `scan-panel.test.tsx`, `verification-panel.test.tsx`, `apps/web/src/lib/websites-client.test.ts`, `scans-client.test.ts`

**Interfaces:** Produces `describeNextScan(nextScanAt: string | null, now: Date): string`.

- [ ] **Step 1: Failing test** — `schedule-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { describeNextScan } from './schedule-text';

const now = new Date('2026-09-17T12:00:00.000Z');
const later = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe('describeNextScan', () => {
  it('describes off, due, and upcoming schedules', () => {
    expect(describeNextScan(null, now)).toBe('Scheduled scans are off');
    expect(describeNextScan(later(-1000), now)).toBe('Next scheduled scan is due now');
    expect(describeNextScan(later(20_000), now)).toBe('Next scheduled scan in 1 minute');
    expect(describeNextScan(later(30 * 60_000), now)).toBe('Next scheduled scan in 30 minutes');
    expect(describeNextScan(later(6 * 3_600_000), now)).toBe('Next scheduled scan in 6 hours');
    expect(describeNextScan(later(3 * 86_400_000), now)).toBe('Next scheduled scan in 3 days');
  });
});
```

- [ ] **Step 2:** Run — fail.

- [ ] **Step 3: Implement `schedule-text.ts`**

```ts
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

/** Human wording for a website's next scheduled scan. */
export function describeNextScan(nextScanAt: string | null, now: Date): string {
  if (nextScanAt === null) {
    return 'Scheduled scans are off';
  }
  const diffMs = new Date(nextScanAt).getTime() - now.getTime();
  if (diffMs <= 0) {
    return 'Next scheduled scan is due now';
  }
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) {
    return `Next scheduled scan ${relative.format(minutes, 'minute')}`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `Next scheduled scan ${relative.format(hours, 'hour')}`;
  }
  return `Next scheduled scan ${relative.format(Math.round(hours / 24), 'day')}`;
}
```

- [ ] **Step 4: Form + badge.** In `scan-config-form.tsx` import `describeNextScan` from `@/lib/schedule-text` and add directly after the frequency `</Select>`:

```tsx
        <p className="text-xs text-muted-foreground">
          {describeNextScan(website.nextScanAt, new Date())}
        </p>
```

In `scan-panel.tsx`, inside the status row after the status `<Badge>`, add:

```tsx
              {latest.trigger === 'scheduled' ? <Badge variant="outline">Scheduled</Badge> : null}
```

- [ ] **Step 5: Badge test + fixtures.** In `scan-panel.test.tsx` add `trigger: 'manual',` to the `scan()` fixture and append:

```tsx
  it('marks a scheduled scan', () => {
    scans = [scan({ trigger: 'scheduled' })];

    render(<ScanPanel website={website} />);

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });
```

Add `trigger: 'manual',` to the scan fixture in `scans-client.test.ts`, and `nextScanAt: null,` to the Website fixtures in `websites-client.test.ts` and `verification-panel.test.tsx`.

- [ ] **Step 6:** Web suite, typecheck, lint, build — green.
- [ ] **Step 7:** Commit `feat(web): show next scheduled scan and mark scheduled scans`.

---

### Task 6: Live verification, ledger, README, PR

- [ ] **Step 1:** Full gates (`pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`).
- [ ] **Step 2: Live.** Serve the scratchpad `crawlsite` on :8080; `pnpm dev`; sign up/verify/sign in; create website `http://localhost:8080`, mark verified in SQL; `PATCH { scanFrequency: 'daily' }` → `nextScanAt` ≈ now + 1 day; set `nextScanAt = now() - interval '1 minute'` in SQL; wait up to ~90 s; expect a new scan with `trigger: scheduled`, completed, its audit completed, and `nextScanAt` ≈ tick time + 1 day. `PATCH { scanFrequency: 'daily', maxDepth: 2 }` → `nextScanAt` unchanged. Confirm exactly one tick job scheduler in Redis (`docker exec wintel-redis redis-cli --scan --pattern 'bull:scan-scheduler:repeat*'`).
- [ ] **Step 3:** Stop the stack.
- [ ] **Step 4:** README mentions scheduled scans; append slice-6a ledger. Commit `docs: note scheduled scans in readme`.
- [ ] **Step 5:** Push `feat/dashboards` (branch name kept; PR title names the scheduler), `gh pr create --base main`.
- [ ] **Step 6:** Wait for CI; report.

---

## Self-Review

- **Spec coverage:** Goal 1 (auto scans per interval) Tasks 1, 4; Goal 2 (shared rules) Tasks 2, 3, 4; Goal 3 (no bursts: advance before deciding, one claim) Task 4 tests; Goal 4 (trigger) Tasks 1, 2, 4; Goal 5 (web) Task 5. Decisions: single job scheduler (Task 4 registrar), conditional claim (Task 4 lost-claim test), first run on frequency change only when changed (Task 3) and on verification only when null (Task 4), manual scans untouched (no change to `ScansService` beyond the shared decision), batch limit via `take` (Task 4). Errors: per-website failure isolation (Task 4 test), unverified/manual/future ignored (Task 4 test).
- **Placeholders:** none.
- **Types:** `evaluateScanStart` input/output match between types (Task 2), API (Task 3), worker (Task 4). `ActiveScanSnapshot` accepts Prisma scan rows (extra fields allowed). Crawl job payload matches `WebsiteCrawlJob`.
