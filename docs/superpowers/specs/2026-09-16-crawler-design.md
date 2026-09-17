# Crawler Design — Website Intelligence Platform

**Date:** 2026-09-16
**Status:** Approved
**Slice:** 4 of N (Crawler). Depends on slices 1 (foundation), 2 (auth + organizations), and 3
(website management).

## Context

Slice 3 shipped the `Website` resource: org-scoped registration, DNS/meta ownership verification in
the worker, and stored scan configuration (`maxDepth`, `maxPages`, `includePaths`, `excludePaths`,
`scanFrequency`, `respectRobotsTxt`). That config is stored and never executed.

This slice executes it. A user triggers a scan of a **verified** website; the worker walks the site
over plain HTTP, and every page it touches becomes a row. The slice stops there: no checks, no
scores, no issues. Slice 5 (audit engine) reads those rows and produces findings, and slice 6
(dashboards) visualizes them. The seam between crawling and judging is deliberate — a crawl is
expensive and slow, an audit is cheap and will be re-run as rules change, so they must not be
welded together.

## Goals

1. A user with `admin` or `owner` in the active organization can start a scan of a verified website
   via the API; the scan runs asynchronously in the worker.
2. The crawl discovers internal URLs from the website's root, honours every stored scan-config
   limit, and stops deterministically at one of: no frontier left, `maxPages`, `maxDepth`, or a
   wall-clock deadline.
3. Every fetched page is stored with its response metadata, its raw HTML (capped and compressed),
   and the links it points at — enough for slice 5 to audit without re-crawling.
4. A page that fails to fetch is recorded as data, not as a crashed scan.
5. All scan and page reads are org-scoped and role-gated: members read, admins and owners start.
6. The web app starts a scan from the website detail page, shows live progress, and lists the
   crawled pages when the scan finishes.

## Non-Goals (this slice)

- Any analysis, rule, check, score, or issue. Slice 5.
- A scheduler. `scanFrequency` stays a stored field; no repeatable jobs, no cron, no missed-run
  handling. Slice 6.
- JavaScript rendering. Pages are fetched over HTTP and parsed as served; a client-rendered SPA
  will crawl as a near-empty page. A headless renderer is a later slice if real sites demand it.
- Crawling subdomains, external hosts, or non-HTML resources. External and non-HTML links are
  recorded, never fetched.
- Sitemap ingestion (`sitemap.xml`), incremental/delta crawls, and diffing a scan against the
  previous one.
- Cancelling a running scan, or per-organization crawl quotas and rate limits.
- Re-running a scan automatically after a failure.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Slice boundary | Crawler **stores pages only**; no checks | An audit re-runs whenever rules change; a crawl is slow and polite-rate-limited. Welding them would force a full re-crawl per rule edit. |
| Fetch engine | Plain HTTP (`fetch`/undici) + `cheerio` | No browser binaries in the worker image, fast, deterministic, trivially testable. JS-rendered content is a known, accepted gap (see Non-Goals). |
| Job shape | **One BullMQ job per scan** | The frontier, visited set, and limits live in one process, so the crawl is a single unit of reasoning and one unit test. Per-page jobs would need a shared Redis visited-set and a "scan finished" detector for no benefit at this scale (`maxPages` defaults to 500). |
| Restart behaviour | A worker restart mid-scan loses that scan | Accepted cost of the one-job shape. The scan is marked `failed` by the deadline guard on the next run; the user re-triggers. Revisit if scans grow past the 10-minute deadline. |
| Raw HTML storage | Separate `PageContent` table, gzipped, 1 MB cap | Slice 5 must parse HTML without re-crawling. Keeping bytes out of `Page` keeps list/aggregate queries fast, and the cap bounds a hostile or generated page. |
| Content retention | On scan completion, delete `PageContent` for that website's older scans | 500 pages x ~100 KB compounds fast. Metadata history is cheap and stays; bodies only matter for the newest scan. |
| Link storage | `PageLink` rows (`url`, `internal`) | The frontier already extracts links; persisting them hands slice 5 broken-link and orphan-page analysis for free. |
| Scan-level failure | `failed` only when the scan cannot run (root unreachable, unexpected throw). Per-page errors are rows | Same distinction slice 3 drew between a business outcome and an infra fault. |
| Stop reason | Explicit `stopReason` on `Scan` | "487 pages" means nothing without knowing whether the crawl finished or hit `maxPages`. The UI and slice 5 both need it. |
| Concurrency | Fixed 5 in-flight requests, hand-rolled pool | Polite by default, no new dependency, ~20 lines and directly testable. Configurable per-org rate limits are a later slice. |
| robots.txt | Minimal hand-rolled parser (`User-agent`, `Allow`, `Disallow`, `Crawl-delay`) | The subset real sites use. Avoids a dependency whose edge cases we would not exercise. Honoured only when `website.respectRobotsTxt` is true. |
| Scope of a crawl | Exact host match against `website.domain` (plus the `www.` variant of it) | Predictable and matches what the user verified. Subdomain crawling is a Non-Goal. |
| Concurrency guard | One active scan per website (409) | Two concurrent crawls of one site double the load on someone else's server for no user benefit. |
| RBAC | `admin`+ starts a scan; members read scans and pages | Starting a scan consumes resources and hits a third party; reading is harmless. Matches slice 3. |
| Tenant scoping | `organizationId` denormalized onto `Scan` | Lets scan and page queries filter by org without joining through `Website` on every read. The repository remains the only place the filter is applied. |

## Architecture

### Data model (`packages/database`, new migration)

```prisma
enum ScanStatus {
  queued
  running
  completed
  failed
}

enum ScanStopReason {
  finished    // frontier exhausted
  maxPages
  maxDepth
  deadline
}

model Scan {
  id             String          @id @default(uuid())
  websiteId      String
  organizationId String
  status         ScanStatus      @default(queued)
  stopReason     ScanStopReason?
  startedAt      DateTime?
  finishedAt     DateTime?
  pagesCrawled   Int             @default(0)
  pagesFailed    Int             @default(0)
  error          String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  website Website @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  pages   Page[]

  @@index([websiteId, createdAt])
  @@index([organizationId])
  @@map("scan")
}

model Page {
  id             String   @id @default(uuid())
  scanId         String
  url            String
  path           String
  depth          Int
  statusCode     Int?
  contentType    String?
  byteSize       Int?
  responseTimeMs Int?
  title          String?
  redirectedTo   String?
  error          String?
  fetchedAt      DateTime @default(now())

  scan    Scan         @relation(fields: [scanId], references: [id], onDelete: Cascade)
  content PageContent?
  links   PageLink[]

  @@unique([scanId, url])
  @@index([scanId, statusCode])
  @@map("page")
}

model PageContent {
  pageId  String @id
  html    Bytes  // gzipped, <= 1 MB compressed
  page    Page   @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@map("page_content")
}

model PageLink {
  id       String  @id @default(uuid())
  pageId   String
  url      String
  internal Boolean

  page Page @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId])
  @@map("page_link")
}
```

`Website` gains `scans Scan[]`. Cascade deletes mean removing a website removes its scans, pages,
content, and links.

### Contracts (`@wintel/types`)

- `scanStatusSchema`, `scanStopReasonSchema` — enums mirroring Prisma.
- `scanSchema` / `Scan` — the API representation (dates as ISO strings, as in `websiteSchema`).
- `pageSchema` / `Page`, `pageListSchema` — paginated page reads: `{ items, total, limit, offset }`.
- `websiteCrawlJobSchema` / `WebsiteCrawlJob` — the queue contract:
  `{ scanId, websiteId, organizationId, url, domain, maxDepth, maxPages, includePaths,
  excludePaths, respectRobotsTxt }`. The job carries the config snapshot so a config edit
  mid-flight cannot change the rules of a running crawl.
- `WEBSITE_CRAWL_QUEUE = 'website-crawl'`.

### API (`@wintel/api`, new `modules/scans`)

| Route | Role | Behaviour |
|---|---|---|
| `POST /api/v1/websites/:id/scans` | admin | 404 if the website is not in the caller's org. 409 `WEBSITE_NOT_VERIFIED` unless `verificationStatus === 'verified'`. 409 `SCAN_IN_PROGRESS` if a scan is `queued` or `running`. Otherwise creates a `queued` scan, enqueues the crawl job, returns 202 + the scan. |
| `GET /api/v1/websites/:id/scans` | member | Recent scans for that website, newest first. |
| `GET /api/v1/scans/:id` | member | One scan; 404 across orgs. |
| `GET /api/v1/scans/:id/pages?limit&offset` | member | Paginated pages, `limit` default 50 / max 200. |

`ScansRepository` is the single place `organizationId` is applied, mirroring `WebsitesRepository`.
`ScansService` owns the verified/in-progress rules and the enqueue; `WebsiteCrawlQueueService` is
the producer, modelled on `WebsiteVerifyQueueService`.

### Worker (`@wintel/worker`, new `queues/website-crawl`)

| Unit | Responsibility |
|---|---|
| `WebsiteCrawlProcessor` | Validates the job, marks the scan `running`, delegates to `CrawlRunner`, writes the terminal scan state. |
| `CrawlRunner` | Pure orchestration: frontier, visited set, depth accounting, concurrency pool, limit and deadline enforcement. Takes fetcher, parser, robots, and writer as constructor dependencies — no I/O of its own. |
| `PageFetcher` | One HTTP request: 10 s timeout, at most 5 redirects, 2 MB response cap, `WintelBot/1.0 (+https://wintel.example/bot)` UA. Returns status, headers, timing, final URL, and the body (or a failure reason). |
| `HtmlParser` | `cheerio`: `<title>`, `<a href>` (resolved against `<base href>` when present). |
| `RobotsTxt` | Fetches and parses `/robots.txt` once per scan; answers `isAllowed(path)` and exposes `crawlDelayMs`. Fetch failure or a 4xx means "no restrictions". |
| `UrlCanonicalizer` | Resolves relative URLs, drops the fragment, lowercases the host, removes the default port, strips a trailing slash except at the root. Keeps the query string — two query strings are two pages. |
| `CrawlWriter` | Batched persistence (50 pages per `createMany`), content gzip + cap, link rows, counters, and the retention prune. |

Crawl rules, applied in this order per candidate URL: same host (`domain` or its `www.` variant)
→ not already visited → depth within `maxDepth` (root is depth 0) → not matched by `excludePaths`
→ matched by `includePaths` when that list is non-empty → allowed by robots.txt when
`respectRobotsTxt`. Path rules are prefix matches. Non-HTML responses are recorded as pages (status,
type, size) but never parsed for links.

Stop conditions, checked in this precedence: 10 minutes elapsed (`deadline`), `pagesCrawled`
reached `maxPages` (`maxPages`), or the frontier emptied. An emptied frontier reports `maxDepth`
when at least one candidate was dropped for exceeding `maxDepth`, and `finished` when none was —
so `finished` means "the whole site within the rules was crawled". In every case the scan ends
`completed` with the reason recorded; `stopReason` is never null on a `completed` scan.

### Web (`@wintel/web`)

The website detail page gains a scan panel: a **Scan** button (disabled unless verified, or while a
scan is running), the current scan's status with `pagesCrawled`/`pagesFailed` counters, and the stop
reason when it ends. While a scan is `queued` or `running` the query polls every 2 s and stops on a
terminal state. Below it, a paginated table of the latest scan's pages — URL, status code, response
time, size — with failed pages visually distinct.

New hooks in `use-scans.ts` (`useScans`, `useScan`, `useScanPages`, `useStartScan`) over a
`scans-client.ts`, matching the slice-3 client/hook split.

## Data Flow

1. User clicks **Scan**. `POST /websites/:id/scans`.
2. `ScansService` checks org ownership, verification, and in-progress scans; inserts a `queued`
   `Scan`; enqueues `WebsiteCrawlJob` with a snapshot of the scan config; returns 202.
3. `WebsiteCrawlProcessor` marks the scan `running` with `startedAt`.
4. `CrawlRunner` fetches `/robots.txt` (when honoured), seeds the frontier with the website URL at
   depth 0, and loops: take up to 5 URLs, fetch concurrently, record each page, extract and filter
   links, enqueue survivors at depth + 1, flush writes every 50 pages.
5. On a stop condition the runner returns its counters and reason; the processor writes
   `completed`, `finishedAt`, counters, and prunes older `PageContent` for that website.
6. The web app's poll observes the terminal state and renders the page list.

## Error Handling

| Failure | Handling |
|---|---|
| Page times out, connection refused, DNS failure, non-2xx | A `Page` row with `error` and/or `statusCode`; `pagesFailed` increments. The crawl continues. |
| Response exceeds 2 MB | Recorded with its status and `byteSize`; body discarded, no content row, no link extraction. |
| Root URL unreachable | Scan ends `failed` with the error. Nothing to crawl means nothing to report. |
| `robots.txt` unreachable or malformed | Treated as "no restrictions"; the crawl proceeds. |
| Deadline hit | Scan ends `completed` with `stopReason: deadline`; everything crawled so far is kept. |
| Unexpected throw in the processor | Scan ends `failed` with the message. The job is **not** retried — a partial crawl already wrote rows, and a blind retry would double them. The crawl queue therefore registers with `attempts: 1`, overriding the worker's default of 3. |
| Worker dies mid-scan | The scan is left `running` with no process behind it. `ScansService` treats a `running` scan whose `startedAt` is older than the deadline as **stale**: it marks that scan `failed` and allows the new scan rather than answering 409 `SCAN_IN_PROGRESS`. Without this, one crashed worker would block a website's scans forever. |

## Testing (90%+ on business logic)

- **Unit:** `UrlCanonicalizer` (relative, protocol-relative, fragment, port, trailing slash, query);
  `RobotsTxt` (user-agent matching, `Allow` over `Disallow` specificity, crawl-delay, missing file);
  `HtmlParser` (links, `<base href>`, malformed HTML, title); path-rule filtering; the concurrency
  pool.
- **`CrawlRunner` against a fake site:** an in-memory map of URL → HTML injected as the fetcher.
  Covers depth limiting, `maxPages`, cycles (A→B→A), self-links, external links recorded but not
  fetched, failed pages counted, and each `stopReason`.
- **Integration:** `WebsiteCrawlProcessor` against real Postgres — scan transitions, page/content/
  link rows, counters, retention prune.
- **E2E (API):** unauthenticated 401s; 409 on an unverified website; 409 on a second concurrent
  scan.
- **Live verification (final task):** crawl a small static site served locally, with a deliberate
  404 link and a cycle, and confirm the stored rows match the site.

## Config

No new environment variables. Crawl limits come from the website's stored config; the fixed
operational values (concurrency 5, 10 s request timeout, 5 redirects, 2 MB cap, 10-minute deadline,
1 MB compressed content cap, user agent) are exported constants in the worker so tests reference
them by name rather than by literal.

New dependency: `cheerio` (worker only), version pinned from the registry at implementation time.

## Build Order (feeds the implementation plan)

1. Database: `Scan`, `Page`, `PageContent`, `PageLink` + migration.
2. `@wintel/types`: scan/page contracts and the crawl-job contract.
3. API: `ScansRepository` → `ScansService` → `WebsiteCrawlQueueService` → `ScansController` +
   module wiring + e2e.
4. Worker primitives: `UrlCanonicalizer`, `RobotsTxt`, `HtmlParser`, `PageFetcher`, concurrency pool.
5. Worker: `CrawlRunner` against the fake site.
6. Worker: `CrawlWriter` + `WebsiteCrawlProcessor` + module wiring.
7. Web: `scans-client` + hooks, scan panel, page table.
8. Full-stack live crawl, ledger, PR.
