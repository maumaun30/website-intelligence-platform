# Audit Engine Design — Website Intelligence Platform

**Date:** 2026-09-17
**Status:** Approved
**Slice:** 5 of N (Audit engine). Depends on slices 1–4 (foundation, auth + organizations, website
management, crawler).

## Context

Slice 4 shipped the crawler: a scan of a verified website stores every fetched page (`Page`), its
gzipped HTML (`PageContent`, kept only for each website's newest scan), and its outbound links
(`PageLink`). Nothing judges those rows yet.

This slice judges them. Every completed scan is audited automatically; the audit reads only what
the crawl stored — never the live site — and produces issues, each tied to a page, with a severity
and evidence. Because crawling and auditing are separate, an admin can re-run the audit on the
latest scan when rules change without re-crawling anyone's server.

## Goals

1. When a scan completes, an audit of it runs automatically in the worker.
2. The audit evaluates a fixed catalog of 15 technical-SEO rules and stores one issue per affected
   page per rule finding, with severity (`critical`, `warning`, `notice`), a message, and evidence.
3. Each audit stores its per-severity issue counts.
4. An `admin`+ can re-run the audit of a website's latest completed scan; members can read audits,
   issues, and the rule catalog. All reads are org-scoped.
5. The web app shows audit status, severity counts, and issues grouped by rule with their affected
   pages, updating live while the audit runs.

## Non-Goals (this slice)

- A composite health score. Weighting is a product decision for the dashboards slice.
- AI explanations or fix suggestions. Later slice.
- Accessibility, performance (lab metrics), security-header, or content-quality rules.
- Configurable, per-organization, or user-authored rules; muting or ignoring issues.
- Comparing audits across scans (new/fixed issues). Dashboards slice.
- Checking links the crawl did not fetch (beyond limits, robots-blocked, external). Their status is
  unknown and they are never reported as broken.
- Auditing scans whose HTML has been pruned.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Trigger | Automatic after a scan completes, plus an admin re-run endpoint | Every scan is useful without a second click; re-run is the payoff of the crawl/audit seam. |
| Where it runs | Worker, new `scan-audit` BullMQ queue, one job per audit, `attempts: 1` | Same producer/consumer pattern as the crawl. A partial audit is replaced on re-run, so retries add nothing. |
| Who enqueues the automatic audit | The crawl processor, after marking the scan `completed` | It is the only place that knows the scan just finished. |
| Rule representation | TypeScript objects `{ id, evaluate(ctx) }` over a prepared `AuditContext`; catalog metadata (title, severity, description) in `@wintel/types` | Deterministic, unit-testable per rule, no DSL to build. API and web share titles and severities without importing worker code. |
| Two-stage engine | Stage 1 extracts small per-page facts from HTML in batches of 50, discarding HTML; stage 2 runs all rules over the in-memory context | 500 pages x up to 2 MB of HTML must never sit in memory at once. Facts are a few hundred bytes per page. Rules never touch the database or HTML. |
| Issue granularity | One issue per (rule, page, finding); broken/redirected links produce one issue per (source page, target URL) | Lets the UI list affected pages and lets a later diff compare audits row by row. |
| Audit cardinality | One `Audit` per scan (`scanId` unique); re-run resets it and replaces its issues | "The audit of this scan" is a single thing to the user; history of re-runs has no consumer yet. |
| Counts | Stored on `Audit` (`criticalCount`, `warningCount`, `noticeCount`) | Scan panels and future dashboards read counts constantly; issues change only when the audit reruns. |
| Re-run eligibility | Only the website's newest completed scan | Older scans' HTML is pruned by the crawler; auditing them would silently skip every HTML rule. |
| Unknown link status | Links to URLs without a `Page` row in the same scan are ignored | Absence of evidence is not a broken link. |
| RBAC | Members read audits/issues/catalog; admins+ re-run | Matches scans. |

## Rules

Thresholds are exported constants in the worker. "HTML page" means a page with `statusCode` 200–299,
a `text/html` content type, and a stored `PageContent` row.

| Rule id | Severity | Fires when | Evidence |
|---|---|---|---|
| `broken-internal-link` | critical | A page links to an internal URL whose `Page` in the same scan has `statusCode >= 400`, or a request `error` with no status | `{ targetUrl, statusCode, error }` |
| `server-error` | critical | A page has `statusCode >= 500`, or an `error` with no status | `{ statusCode, error }` |
| `client-error` | warning | A page has `statusCode` 400–499 | `{ statusCode }` |
| `missing-title` | warning | HTML page with no non-empty `<title>` | `{}` |
| `duplicate-title` | warning | HTML page whose title is shared with at least one other HTML page (case-sensitive, trimmed) | `{ title, duplicateCount }` |
| `missing-meta-description` | warning | HTML page with no non-empty `<meta name="description">` | `{}` |
| `missing-h1` | warning | HTML page with zero `<h1>` elements | `{}` |
| `slow-response` | warning | A page's `responseTimeMs` > 2000 | `{ responseTimeMs }` |
| `redirected-link` | notice | A page links to an internal URL whose `Page` has `redirectedTo` set | `{ targetUrl, redirectedTo }` |
| `title-length` | notice | HTML page whose title is shorter than 10 or longer than 60 characters | `{ title, length }` |
| `duplicate-meta-description` | notice | HTML page whose meta description is shared with another HTML page | `{ description, duplicateCount }` |
| `multiple-h1` | notice | HTML page with more than one `<h1>` | `{ count }` |
| `missing-canonical` | notice | HTML page with no `<link rel="canonical" href>` | `{}` |
| `noindex` | notice | HTML page whose `<meta name="robots">` content contains `noindex` | `{ content }` |
| `large-page` | notice | A page's `byteSize` > 1 000 000 | `{ byteSize }` |

`missing-title` and `title-length` are mutually exclusive (length is only checked when a title
exists); the same holds for `missing-h1`/`multiple-h1`. A 5xx page fires `server-error` only, never
`client-error`.

## Architecture

### Data model (`packages/database`, new migration)

```prisma
enum AuditStatus {
  queued
  running
  completed
  failed
}

enum IssueSeverity {
  critical
  warning
  notice
}

model Audit {
  id             String      @id @default(uuid())
  scanId         String      @unique
  organizationId String
  status         AuditStatus @default(queued)
  criticalCount  Int         @default(0)
  warningCount   Int         @default(0)
  noticeCount    Int         @default(0)
  startedAt      DateTime?
  finishedAt     DateTime?
  error          String?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  scan   Scan    @relation(fields: [scanId], references: [id], onDelete: Cascade)
  issues Issue[]

  @@index([organizationId])
  @@map("audit")
}

model Issue {
  id       String        @id @default(uuid())
  auditId  String
  pageId   String
  ruleId   String
  severity IssueSeverity
  message  String
  evidence Json          @default("{}")

  audit Audit @relation(fields: [auditId], references: [id], onDelete: Cascade)
  page  Page  @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([auditId, severity])
  @@index([auditId, ruleId])
  @@map("issue")
}
```

`Scan` gains `audit Audit?`; `Page` gains `issues Issue[]`.

### Contracts (`@wintel/types`)

- `AUDIT_STATUSES`, `ISSUE_SEVERITIES`, `AUDIT_RULE_IDS` (the 15 ids).
- `AUDIT_RULES`: readonly catalog `Record<AuditRuleId, { title, severity, description }>`.
- `auditSchema` / `Audit`, `issueSchema` / `Issue` (includes `page: { url, path }` for display),
  `issueListQuerySchema` (`severity?`, `ruleId?`, `limit` default 50 max 200, `offset`),
  `issueListSchema` (`{ items, total, limit, offset }`), `auditRuleSchema` list for the catalog
  endpoint.
- `SCAN_AUDIT_QUEUE = 'scan-audit'`, `scanAuditJobSchema` / `ScanAuditJob` = `{ auditId, scanId }`.

### API (`@wintel/api`, new `modules/audits`)

| Route | Role | Behaviour |
|---|---|---|
| `GET /api/v1/scans/:id/audit` | member | The scan's audit; 404 if the scan is outside the org or has no audit. |
| `GET /api/v1/scans/:id/issues?severity&ruleId&limit&offset` | member | Paginated issues ordered by severity (critical first), rule, page path. 404 across orgs. |
| `POST /api/v1/scans/:id/audit` | admin | 404 across orgs. 409 `SCAN_NOT_COMPLETED` unless the scan is `completed`. 409 `AUDIT_CONTENT_UNAVAILABLE` unless it is the website's newest completed scan. 409 `AUDIT_IN_PROGRESS` if its audit is `queued` or `running` and was last updated less than `AUDIT_STALE_MS` ago (an older one is abandoned and may be re-queued). Otherwise upserts the audit to `queued` (zeroed counts, cleared error/timestamps), enqueues, returns 202 + the audit. |
| `GET /api/v1/audit-rules` | member | The rule catalog. |

`AuditsRepository` applies `organizationId` (denormalized onto `Audit`, checked through `Scan` for
scan lookups). `AuditsService` owns the re-run rules. `ScanAuditQueueService` is the producer.

### Worker (`@wintel/worker`, new `queues/scan-audit`)

| Unit | Responsibility |
|---|---|
| `extractPageFacts(html)` | cheerio: trimmed title (or null), meta description (or null), H1 count, has canonical, robots noindex content (or null). |
| `AuditContextLoader` | Reads the scan's pages (metadata), links, and content in batches of 50; gunzips and extracts facts per batch; returns `AuditContext` `{ pages, factsByPageId, pageByUrl, linksByPageId }`. |
| `rules/*.ts` + `AUDIT_RULE_IMPLEMENTATIONS` | One file per rule family; each rule `{ id, evaluate(ctx): IssueDraft[] }`. Severity and title come from `AUDIT_RULES`. |
| `runAudit(ctx)` | Runs every rule, returns drafts plus per-severity counts. Pure. |
| `ScanAuditProcessor` | Validates the job, claims `queued → running`, loads the context, runs rules, replaces issues (delete then `createMany` in batches of 500) and writes counts in one transaction, marks `completed`; on throw marks `failed` and rethrows. |
| `ScanAuditQueueService` (worker) | Producer used by the crawl processor: `createQueuedAudit(scanId, organizationId)` upserts the scan's `Audit` as `queued`; `enqueue(audit)` adds the job. |

The crawl processor creates the queued audit **before** marking the scan `completed`, so a
completed scan always has an audit row and the web app never sees a completed scan without one.
After `completed` + prune it adds the job. If adding the job throws, the scan stays `completed` (its
data is valid) and the error is logged; the audit stays `queued` until it goes stale, after which an
admin can re-run it.

### Web (`@wintel/web`)

An audit section under the scan status in the scan panel, rendered once the newest scan is
`completed`: audit status badge, three severity counts, and a **Re-run audit** button (disabled
while queued/running). Below it, issues grouped by rule: title, severity badge, affected-page count;
expanding a rule lists affected pages (path + message), paginated. While the audit is `queued` or
`running` the audit query polls every 2 s. Rule titles and severities come from `AUDIT_RULES`.

Grouping needs per-rule counts: `GET /scans/:id/audit` includes `ruleCounts: { ruleId, severity,
count }[]`, computed with one `groupBy` when read. Affected pages load per rule through the issues
endpoint with `ruleId`.

## Data Flow

1. Crawl processor flushes pages, upserts `Audit(queued)`, marks the scan `completed`, prunes old
   content, and enqueues `{ auditId, scanId }`.
2. `ScanAuditProcessor` claims `queued → running`.
3. `AuditContextLoader` pages through the scan in batches of 50: page rows, their links, their
   content → facts. HTML is dropped after each batch.
4. `runAudit` evaluates the 15 rules and counts by severity.
5. One transaction deletes the audit's existing issues, inserts the new ones, writes counts and
   `completed`.
6. The web app's audit poll sees `completed` and renders counts and grouped issues.
7. Re-run: `POST /scans/:id/audit` resets the audit to `queued` and enqueues; steps 2–6 repeat.

## Error Handling

| Failure | Handling |
|---|---|
| Malformed HTML | cheerio is lenient; facts are whatever parses. Never an error. |
| Content row missing or not gunzippable for a page | That page gets no facts; HTML rules skip it; metadata rules still apply. Logged once per audit with the count. |
| Unexpected throw during load, rules, or write | Audit `failed` with message, job rethrown (no retry). Existing issues are untouched because the replace is one transaction. |
| Stalled job re-delivered | Conditional claim finds the audit not `queued` and skips. |
| Enqueue from the crawl processor fails | Scan stays `completed`; audit row may stay `queued`. Re-run endpoint treats a `queued` audit older than 10 minutes as stale and allows re-queueing. |
| Re-run on a pruned or incomplete scan | 409 with a code; nothing queued. |

## Testing (90%+ on business logic)

- **Unit:** `extractPageFacts` on fixtures (missing/duplicate tags, whitespace, case of `NOINDEX`);
  every rule against a hand-built `AuditContext` — fires, doesn't fire, mutual exclusions, unknown
  link targets ignored; `runAudit` counts.
- **Integration (real Postgres):** `ScanAuditProcessor` — seeded scan with content and links →
  exact issues and counts; re-run replaces issues rather than appending; a throwing loader marks
  `failed` and leaves prior issues intact; a non-queued audit is skipped. Crawl processor enqueues
  an audit on completion.
- **API:** repository scoping; service 409s including stale queued audit; e2e 401s, 409
  `SCAN_NOT_COMPLETED`, catalog endpoint.
- **Web:** audit section states (running, completed with counts, failed), grouped rules, re-run.
- **Live:** extend the local crawl site with a duplicate title, a page without H1 or description, a
  `noindex` page, a broken internal link, and a slow page (tiny Node server delaying one path); crawl,
  let the audit run, and assert the exact rule ids and pages.

## Config

No new environment variables. New constants: `AUDIT_BATCH_SIZE = 50`, `ISSUE_INSERT_BATCH = 500`,
`SLOW_RESPONSE_MS = 2000`, `LARGE_PAGE_BYTES = 1_000_000`, `TITLE_MIN_LENGTH = 10`,
`TITLE_MAX_LENGTH = 60`, `AUDIT_STALE_MS = 600_000`. No new dependencies (cheerio is already in the
worker).

## Build Order (feeds the implementation plan)

1. Database: `Audit`, `Issue` + migration.
2. `@wintel/types`: audit/issue contracts, rule catalog, audit job contract.
3. Worker: `extractPageFacts`, `AuditContext` type, rules, `runAudit`.
4. Worker: `AuditContextLoader`, `ScanAuditProcessor`, worker `ScanAuditQueueService`, crawl
   processor hook, module wiring.
5. API: `AuditsRepository` → `AuditsService` → producer → controller + e2e.
6. Web: audits client/hooks, audit section with grouped issues.
7. Live verification, ledger, README, PR.
