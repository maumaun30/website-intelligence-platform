# Insights Design — Website Intelligence Platform

**Date:** 2026-09-17
**Status:** Approved
**Slice:** 6b of N (Insights). Depends on slices 1–6a. Scheduled scans (6a) supply the audit
history this slice reads.

## Context

Every completed scan is audited (slice 5) and verified websites can be scanned on a schedule
(slice 6a), so each website accumulates audits. Nothing summarizes them: a user sees one scan's
issue list at a time, cannot tell whether a site is improving, and has no view across websites.

## Goals

1. Every completed audit has a 0–100 health score.
2. Every completed audit records what changed since the website's previous completed audit: new
   issues, fixed issues, and the score delta.
3. A website shows its current score, its change, and a trend of its recent audits.
4. The organization dashboard lists all websites, worst health first, with score, change, critical
   issue count, last scan, and next scheduled scan.
5. The scan panel shows "since previous audit: N new · M fixed" and lists both.

## Non-Goals

- Configurable score weights; per-rule weighting.
- Comparing two arbitrary audits.
- Alerts or notifications on score drops.
- Cross-organization or benchmark comparisons.
- Recomputing scores for audits completed before this slice (they show "—" until re-run or rescanned).

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Score | `100 − 60·c/N − 30·w/N − 10·n/N`, rounded, floored at 0; `c`/`w`/`n` = pages with at least one issue of that severity; `N` = pages audited in their own right (not redirect aliases) | Page share keeps small and large sites comparable; a page counts once per severity however many issues it has. `N = 0` → score `null`. |
| When computed | In `ScanAuditProcessor`, same transaction as issues | Reads stay trivial; a re-run replaces everything atomically. |
| Fingerprint | `ruleId|page path|targetUrl-or-empty`, stored on `Issue` | Page ids change every scan; path + rule (+ link target) identifies "the same problem". |
| Baseline | The website's newest completed audit whose scan was created before this audit's scan | Re-running the latest audit keeps the same baseline. |
| Diff storage | `Audit.previousAuditId`, `newIssueCount`, `fixedIssueCount`, `scoreDelta` + `IssueChange` rows (`kind` new/fixed, rule, severity, path, message) | Fixed issues reference pages that no longer exist in the current scan, so changes are snapshots, not page references. No baseline → all four fields `null`, no rows. |
| Trend | Read from `Audit` joined to `Scan`, newest 30 by default (max 100), returned oldest first | No new table; the history already exists. |
| Overview | One API call; latest completed audit per website plus the latest scan of any status; sorted worst score first, unscored last, then name | The dashboard's first question is "what needs attention". |
| Existing data | Migration backfills `Issue.fingerprint` with SQL; scores are not backfilled | Fingerprints make the first post-deploy diff meaningful; scores need the page denominator the stored data does not carry cheaply. |
| Chart form | Stat tile: score (semibold) + signed delta vs previous audit + sparkline (≤30 points), hand-rolled SVG | A single current value with a trend; no charting dependency. Single series → no legend; line in the muted text token, latest point in the primary token; per-point hover title; visually hidden table of points. |
| Score bands | ≥90 Good (success), 70–89 Fair (outline), <70 Poor (destructive) — always shown with the word, never color alone | Status colors carry state, not identity. |

## Architecture

### Data model

- `Audit`: `score Int?`, `scoreDelta Int?`, `newIssueCount Int?`, `fixedIssueCount Int?`,
  `previousAuditId String?`.
- `Issue`: `fingerprint String @default("")`, `@@index([auditId, fingerprint])`.
- `enum IssueChangeKind { new fixed }`.
- `IssueChange`: `id`, `auditId` (cascade), `kind`, `ruleId`, `severity`, `path`, `message`,
  `@@index([auditId, kind])`.
- Migration SQL backfills `issue.fingerprint` from `ruleId`, `page.path`, and
  `evidence->>'targetUrl'`.

### Contracts (`@wintel/types`, new `insights.ts`)

- `HEALTH_SCORE_WEIGHTS`, `computeHealthScore(affectedPages: Record<IssueSeverity, number>,
  pageCount: number): number | null`.
- `scoreBand(score: number | null): 'good' | 'fair' | 'poor' | null`.
- `issueFingerprint(ruleId, path, evidence): string`.
- `diffIssues(current, baseline)` over `{ fingerprint, ruleId, severity, message, path }` →
  `{ newIssues, fixedIssues }` (deduplicated by fingerprint).
- Schemas: `auditSchema` gains the five fields; `issueChangeSchema`, `issueChangeListQuerySchema`
  (`kind?`, `limit` 50/200, `offset`), `issueChangeListSchema`; `trendQuerySchema` (`limit` 30/100),
  `trendPointSchema` (`auditId, scanId, finishedAt, trigger, score, criticalCount, warningCount,
  noticeCount`); `overviewRowSchema`.

### Worker

`ScanAuditProcessor` after `runAudit`: attach fingerprints (path from the context), count affected
pages per severity, compute the score over non-alias pages, find the baseline, load its issues
(fingerprint, rule, severity, message, path), diff, and in the transaction also delete and insert
`IssueChange` rows and write score, delta, counts, and `previousAuditId`.

### API

- `AuditsRepository.listChanges(auditId, kind?, limit, offset)`; `AuditsService.listChanges`;
  `GET /scans/:id/changes`.
- New `modules/insights`: `InsightsRepository.trend(websiteId, organizationId, limit)` and
  `overview(organizationId)`; `InsightsService` (website ownership for trend, sort for overview);
  `GET /websites/:id/trend`, `GET /overview`. Members read.

### Web

- `insights-client.ts` + `use-insights.ts` (`useOverview`, `useTrend`, `useChanges`).
- `ScoreBadge`, `ScoreDelta`, `Sparkline`, `WebsiteScoreTile` (detail header), `OverviewTable`
  (dashboard), `AuditChanges` (in the audit section).
- `/dashboard`: overview table first; system health moves to the bottom. App nav gains a
  "Websites" link.

## Error Handling

| Case | Handling |
|---|---|
| Audit with zero audited pages | `score = null`, delta `null`. |
| Baseline audit has `score = null` (pre-slice) | `scoreDelta = null`; issue diff still computed from backfilled fingerprints. |
| Website with no completed audit | Overview row with nulls, sorted last; detail tile shows "No audit yet". |
| Trend with one point | Sparkline draws a single marker, no line. |
| Changes requested for an audit with no baseline | Empty list; UI says "First audit — nothing to compare yet". |

## Testing

- **Unit (types):** score (bounds, weights, floor, rounding, zero pages), bands, fingerprint (link
  vs page rule), diff (new, fixed, persisting, duplicates, empty baseline).
- **Integration (worker):** processor stores score, fingerprints, baseline diff, change rows; re-run
  replaces them; first audit has nulls.
- **API:** changes listing; insights repository scoping + trend order; overview sort; e2e 401/200.
- **Web:** sparkline geometry and accessibility table; score badge bands with labels; overview table
  order/empty state/links; changes summary states.
- **Live:** scan the audit test site, change it (fix some issues, break another), scan again, check
  score, delta, and exact new/fixed lists; overview order across two websites.

## Build Order

1. Database + backfill migration. 2. Types. 3. Worker processor. 4. API (changes, insights).
5. Web. 6. Live verification, docs, PR.
