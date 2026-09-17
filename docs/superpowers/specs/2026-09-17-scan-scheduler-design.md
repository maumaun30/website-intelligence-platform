# Scan Scheduler Design — Website Intelligence Platform

**Date:** 2026-09-17
**Status:** Approved
**Slice:** 6a of N (Scheduled scans). Depends on slices 1–5. Slice 6b (insights: score, trends,
audit diffs, overview) builds on the scan history this slice accumulates.

## Context

Websites have stored `scanFrequency` (`manual`, `daily`, `weekly`) since slice 3, but nothing acts
on it: every scan is started by hand. Slices 4–5 made a scan fully automatic once started — crawl,
then audit. This slice starts them on schedule, so each website builds an audit history without
anyone clicking.

## Goals

1. A verified website with `scanFrequency` `daily` or `weekly` is scanned automatically about once
   per interval, and each scheduled scan is audited as usual.
2. Scheduled scans obey the same rules as manual ones: verified websites only, one active scan per
   website, stale running scans released.
3. Downtime never causes a burst: a website that missed several runs gets one scan, not a backlog.
4. Scans record how they were started (`manual` or `scheduled`).
5. The web app shows when the next scheduled scan is due and marks scheduled scans.

## Non-Goals

- Choosing a time of day, time zone, or custom cron expression.
- Per-organization scan quotas, concurrency limits, or plan-based frequencies (billing slice).
- Notifications when a scheduled scan finds new issues (insights/alerts slice).
- Retrying a scheduled run that was skipped because a scan was active.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Mechanism | One BullMQ job scheduler (`upsertJobScheduler`, fixed id, every 60 s) on a `scan-scheduler` queue; the tick selects due websites by `Website.nextScanAt` | One source of truth in Postgres. Per-website repeatable jobs would have to be kept in sync with every frequency change, verification change, and delete. An API-side cron would fire once per API replica. |
| Due-ness | `nextScanAt DateTime?`, indexed; `null` when manual | Selection is a single indexed query; the schedule survives restarts and Redis flushes. |
| Advancing | The tick advances `nextScanAt` to `now + interval` **before** deciding whether to start, for started and skipped websites alike | No catch-up bursts, and a website that repeatedly fails to start cannot be retried every minute. |
| Double-claim safety | Advance with a conditional `updateMany` (`where: { id, nextScanAt: <value read> }`); only a claimed website proceeds | Two concurrent ticks (overlapping delivery, two workers) can never both start a scan for one website. |
| Setting the first run | API: when `scanFrequency` **changes**, `nextScanAt = now + interval` (or `null` for manual). Worker: when verification succeeds and `nextScanAt` is null with a non-manual frequency, set it | Saving the config form without changing frequency must not postpone the schedule. |
| Manual scans | Do not touch `nextScanAt` | A manual scan is extra, not a replacement for the schedule. |
| Shared start rules | Pure `evaluateScanStart` in `@wintel/types`, used by `ScansService` and the scheduler | The verified / one-active / stale rules live in one tested place; only the database calls differ. |
| Batch | At most 50 due websites per tick, oldest `nextScanAt` first | Bounds a tick's duration; a backlog drains over successive minutes. |
| Trigger | `ScanTrigger` enum (`manual`, `scheduled`) on `Scan`, default `manual` | Needed by the UI now and by insights later. |

## Architecture

### Data model

```prisma
enum ScanTrigger {
  manual
  scheduled
}
```

- `Website.nextScanAt DateTime?` plus `@@index([nextScanAt])`.
- `Scan.trigger ScanTrigger @default(manual)`.

### Contracts (`@wintel/types`)

- `SCAN_TRIGGERS`; `scanSchema.trigger`; `websiteSchema.nextScanAt: string | null`.
- `schedule.ts`:
  - `SCAN_INTERVAL_MS = { daily: 86_400_000, weekly: 604_800_000 }`.
  - `computeNextScanAt(frequency, from: Date): Date | null`.
  - `isStaleScan({ status, startedAt }, now): boolean` (moved from `ScansService`).
  - `evaluateScanStart({ verificationStatus, activeScan, now })` →
    `{ action: 'start' } | { action: 'start', staleScanId } | { action: 'refuse', code: 'WEBSITE_NOT_VERIFIED' | 'SCAN_IN_PROGRESS' }`.
- `SCAN_SCHEDULER_QUEUE = 'scan-scheduler'`, `SCHEDULER_TICK_MS = 60_000`,
  `SCHEDULER_BATCH_SIZE = 50`.

### API

- `ScansService.start` delegates the decision to `evaluateScanStart` (behaviour unchanged, existing
  tests keep passing).
- `WebsitesService.update`: reads the current website; when `input.scanFrequency` is present and
  differs, includes `nextScanAt: computeNextScanAt(input.scanFrequency, now)` in the update.

### Worker

- `WebsiteVerifyProcessor`: after a successful check, two conditional `updateMany` calls set
  `nextScanAt` for a daily or weekly website whose `nextScanAt` is still null.
- `ScanSchedulerRegistrar` (`OnApplicationBootstrap`): `upsertJobScheduler('scan-scheduler-tick',
  { every: SCHEDULER_TICK_MS }, { name: 'tick' })`. Idempotent across restarts and workers.
- `ScanSchedulerProcessor.process()`: select due websites (verified, not manual,
  `nextScanAt <= now`), then for each: claim by advancing `nextScanAt`; skip if the claim loses;
  load the newest active scan; `evaluateScanStart`; on `refuse` count as skipped; on stale mark the
  old scan `failed`; create a `queued` scan with `trigger: scheduled`; add the crawl job
  (`attempts: 1`, same payload as a manual scan). A throw for one website is logged and counted;
  the loop continues. Returns `{ due, started, skipped, failed }` and logs it.

### Web

- Scan config form: "Next scheduled scan in 6 hours" / "Next scheduled scan is due now" /
  "Scheduled scans are off" (`Intl.RelativeTimeFormat`).
- Scan panel: a "Scheduled" badge next to the newest scan's status when `trigger` is `scheduled`.

## Error Handling

| Failure | Handling |
|---|---|
| One website fails to start (DB/Redis error) | Logged, counted as failed; its `nextScanAt` was already advanced, so it retries next interval, not next minute. |
| Whole tick throws (DB down) | BullMQ records the failure; the scheduler fires again in 60 s. |
| Redis flushed | The registrar re-creates the job scheduler on next worker start; schedule state is in Postgres. |
| Website deleted or unverified between selection and claim | Deleted: claim affects 0 rows, skipped. Unverified: `evaluateScanStart` refuses. |
| Frequency changed to manual while due | `nextScanAt` becomes null; not selected. |

## Testing

- **Unit:** `computeNextScanAt`, `isStaleScan`, `evaluateScanStart`; `WebsitesService.update` sets
  `nextScanAt` only on a frequency change; verify processor sets it only on success; registrar
  arguments.
- **Integration (real Postgres):** tick starts a due verified website (scheduled trigger, crawl job
  added, `nextScanAt` advanced); skips an active scan but still advances; releases a stale scan;
  ignores manual, unverified, and not-yet-due websites; a lost claim starts nothing; batch limit.
- **Existing suites:** scan service tests unchanged; fixtures gain `trigger` / `nextScanAt`.
- **Live:** set a verified daily website's `nextScanAt` in the past, wait for a tick, observe a
  scheduled scan → completed audit, and `nextScanAt` about a day ahead.

## Build Order

1. Database: `ScanTrigger`, `Scan.trigger`, `Website.nextScanAt` + index.
2. Types: schedule helpers, trigger, `nextScanAt` in schemas.
3. API: `ScansService` refactor, `WebsitesService.update` schedule handling.
4. Worker: verify processor hook, scheduler processor, registrar, module.
5. Web: next-scan text, scheduled badge, fixture updates.
6. Live verification, ledger, README, PR.
