# Website Management Design — Website Intelligence Platform

**Date:** 2026-08-04
**Status:** Approved
**Slice:** 3 of N (Website management). Depends on slices 1 (foundation) and 2 (auth + organizations).

## Context

Foundation (slice 1) shipped the monorepo, `@wintel/config`, `@wintel/database`, `@wintel/api`
(NestJS), `@wintel/worker` (BullMQ), `@wintel/ui`, `@wintel/web`, and CI. Auth (slice 2) added
Better Auth authentication, organizations/members/invitations, RBAC (owner > admin > member), and a
resolved `{ user, activeOrganizationId, role }` principal on every API request. The email queue
proved the API-producer / worker-consumer pipeline end to end.

This slice adds the first real product resource: **websites**. A user registers a site under their
active organization, proves they own the domain, and configures how it should be scanned. Every
later slice — crawler (4), audit engine (5), dashboards (6) — operates on a verified website with a
scan config. Nothing downstream can be built until a website exists, is owned by exactly one
organization, and carries the settings a crawl will consume.

## Goals

1. A user can add a website (name + URL) to their active organization; it is scoped to that org and
   invisible to every other org.
2. A user can prove domain ownership by **either** a DNS TXT record **or** an HTML `<meta>` tag
   (they pick per verification attempt); the check runs asynchronously in the worker and flips the
   website's status to `verified` or `failed`.
3. A user can configure how the website will be scanned (crawl limits, path rules, schedule,
   robots.txt policy). The config is stored now and consumed by the crawler in slice 4.
4. All website operations are org-scoped and role-gated: members read, admins and owners mutate.
5. The web app lists websites, adds them, shows verification instructions + live status, and edits
   scan config — under the authenticated `(app)` shell.

## Non-Goals (this slice)

- Actual crawling / scanning. Slice 4. Scan config is **stored**, not executed.
- A scheduler. `scanFrequency` is a stored field; no cron/interval runner is built this slice.
- Re-verification cadence, verification expiry, or automatic re-checks. A user can re-trigger
  verification manually; scheduled re-checks arrive with observability later.
- Per-website member permissions beyond the three org roles (YAGNI; org roles suffice).
- URL editing after create. `url`/`domain` are immutable; delete and re-add to change them.
- Support for non-HTTP(S) URLs, wildcard/subdomain ownership, or IP-only sites.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Scan config storage | Typed **columns on `Website`** | 1:1 with the website, queryable, Prisma-typed, migration-simple. A separate table or JSON blob adds a join or loses type safety for no current benefit (YAGNI). |
| Ownership methods | **Both** DNS TXT and meta tag; user picks per attempt | DNS suits users who control DNS but not HTML; meta suits the reverse. A strategy interface keeps the two checks isolated and independently testable. |
| Where the check runs | **Worker**, async, via a new `website-verify` BullMQ queue | Reuses the proven producer/consumer pipeline; DNS resolution and remote fetches must never block or hang an API request. |
| Worker DB access | Worker gets its own `PrismaService` (imports `@wintel/database`) and writes the verification result directly | Foundation decision: api + worker both import the generated client. Establishes the write-back pattern the crawler reuses in slice 4. |
| Failed check semantics | A failed ownership check is a **business outcome** (`status=failed`), not a job error. Only infra faults (DNS server error, fetch throw/timeout) rethrow for BullMQ retry | Distinguishes "the token genuinely isn't there" (do not retry) from "we couldn't complete the check" (retry). |
| Dedup | `@@unique([organizationId, domain])` | One website per domain per org; different orgs may register the same domain independently. |
| Verification token | Issued once at create, stable across attempts | The user places it once; switching method or re-verifying reuses the same token. |
| RBAC | members read; admins + owners create/update/delete/verify | Matches slice 2's rank model; `@Roles(admin)` with owner inheriting admin via rank. |
| Contracts | Zod schemas + job contract in `@wintel/types` | Same contract-package pattern as the health and email-job contracts. |
| URL vs domain | Store canonical `url` (`https://host[/path]`) and a derived `domain` (host) | Crawl needs the URL; DNS needs the bare host. Normalize on input. |

## Architecture

### Data model (`packages/database`, new migration)

```prisma
enum VerificationStatus { pending verified failed }
enum VerificationMethod { dns meta }
enum ScanFrequency      { manual daily weekly }

model Website {
  id                 String   @id @default(uuid())
  organizationId     String
  createdById        String
  name               String
  url                String                       // canonical https://host[/path]
  domain             String                       // derived host, for DNS
  verificationStatus VerificationStatus @default(pending)
  verificationMethod VerificationMethod?           // set when a verify attempt starts
  verificationToken  String                        // issued at create, stable
  verifiedAt         DateTime?
  // scan config (consumed by the crawler in slice 4)
  maxDepth           Int      @default(3)
  maxPages           Int      @default(500)
  includePaths       String[] @default([])
  excludePaths       String[] @default([])
  scanFrequency      ScanFrequency @default(manual)
  respectRobotsTxt   Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy    User         @relation(fields: [createdById], references: [id])

  @@unique([organizationId, domain])
  @@index([organizationId])
  @@map("website")
}
```

`Organization` gains `websites Website[]`; `User` gains the `createdBy` back-relation. Migration via
`prisma migrate dev --name add_website_model` (dotenv-wrapped, per the established workflow).

### Contracts (`@wintel/types`)

New `website.ts`:
- Constants: `VERIFICATION_METHODS = ['dns','meta']`, `VERIFICATION_STATUSES = ['pending','verified','failed']`, `SCAN_FREQUENCIES = ['manual','daily','weekly']`.
- `scanConfigSchema`: `maxDepth` (int 1–10), `maxPages` (int 1–5000), `includePaths`/`excludePaths`
  (arrays of path strings, capped length), `scanFrequency` (enum), `respectRobotsTxt` (boolean).
- `createWebsiteInputSchema`: `{ name (1–100), url (z.url, https/http only) }`. Token and status are
  server-issued — never accepted from the client.
- `updateWebsiteInputSchema`: partial `{ name?, ...scanConfig fields? }`. `url` is immutable.
- `verifyWebsiteInputSchema`: `{ method: 'dns' | 'meta' }`.
- `websiteSchema`: full response shape (all columns, dates as ISO strings).

New `website-jobs.ts` (sibling of `email-jobs.ts`):
- `WEBSITE_VERIFY_QUEUE = 'website-verify'`.
- `websiteVerifyJobSchema`: `{ websiteId, domain, url, method, token }`.

### API (`@wintel/api`, new `modules/websites`)

- `WebsitesController` at `/api/v1/websites`, entirely under `SessionGuard`:
  - `GET /` — list the active org's websites.
  - `GET /:id` — one website; 404 if not in the active org (never leak cross-org existence).
  - `POST /` — `@Roles(admin)`. Normalizes url → domain, issues `verificationToken`, status
    `pending`, `createdById` = principal. Rejects duplicate domain in org (unique constraint → 409).
  - `PATCH /:id` — `@Roles(admin)`. Updates name / scan-config fields.
  - `DELETE /:id` — `@Roles(admin)`.
  - `POST /:id/verify` — `@Roles(admin)`. Sets `verificationMethod`, status back to `pending`,
    enqueues a `website-verify` job. Returns the updated website.
- `WebsitesService` — business logic (normalization, token issue, enqueue). No HTTP or Prisma
  details leak in.
- `WebsitesRepository` — thin Prisma wrapper. **Every** query is filtered by `organizationId`; the
  tenant boundary is enforced in one place and cannot be bypassed by a controller.
- `WebsiteVerifyQueue` producer (`@InjectQueue(WEBSITE_VERIFY_QUEUE)`), registered in the module
  alongside the existing email queue registration pattern.
- URL normalization helper: parse, lowercase host, strip default ports, reject non-http(s); derive
  `domain` = host. Unit-tested in isolation.

### Worker (`@wintel/worker`)

- New `DatabaseModule` providing a `PrismaService` (connect/disconnect on lifecycle hooks), imported
  by the worker root module. First DB access in the worker; mirrors the API's `PrismaService`.
- `VerificationStrategy` interface: `verify(job): Promise<boolean>` (true = token found). Two impls:
  - `DnsVerificationStrategy` — `dns.promises.resolveTxt(job.domain)`, flatten record chunks, check
    the token is present.
  - `MetaVerificationStrategy` — `fetch(job.url)` with a timeout and a response-size cap, scan the
    HTML for `<meta name="wintel-verify" content="TOKEN">`.
- `WebsiteVerifyProcessor` `@Processor(WEBSITE_VERIFY_QUEUE)`:
  1. `websiteVerifyJobSchema.parse(job.data)` (guard malformed jobs, same as the email processor).
  2. Pick the strategy by `job.method`.
  3. Run it. A thrown infra error (DNS failure, fetch timeout) propagates → BullMQ retry.
  4. On a completed check, `prisma.website.update` → `verified` (+ `verifiedAt = now`) or `failed`.
- Fetch timeout / max-size are module constants (no new env vars this slice).

### Web (`@wintel/web`, under the `(app)` group)

- `/dashboard/websites` — list (TanStack Query against `GET /websites`) + "Add website" form
  (`createWebsiteInputSchema`), status badge per row.
- `/dashboard/websites/[id]` — detail:
  - Verification panel: pick `dns`/`meta` → show the token + copy-paste instructions for that
    method → "Verify" button (`POST /:id/verify`) → status badge that refetches until it settles.
  - Scan-config form (`updateWebsiteInputSchema`): depth, max pages, include/exclude paths,
    frequency, robots.txt toggle.
- Data fetching and mutations live in hooks / an api-client module; components stay presentational
  (no business logic in React, per project constraints).
- New `@wintel/ui` primitives as needed (e.g. `Select` for method/frequency, `Card`, `Textarea` for
  path lists), shadcn-style, each unit-tested.

## Data Flow

**Add + verify (DNS example):**
1. `POST /websites { name, url }` → service normalizes, issues token `wintel-verify=<token>`, row
   saved `pending`. Response includes the token.
2. Web shows: "Add this TXT record to `example.com`: `wintel-verify=<token>`".
3. User adds the record, clicks Verify (method `dns`) → `POST /:id/verify` → status `pending`, job
   enqueued `{ websiteId, domain, url, method: 'dns', token }`.
4. Worker resolves TXT for `example.com`, finds the token → `prisma.website.update` status
   `verified`, `verifiedAt` set.
5. Web refetch shows the `verified` badge.

**Meta path** is identical except the user places `<meta name="wintel-verify" content="<token>">` on
their homepage and the worker fetches the URL and parses for it.

## Error Handling

- Cross-org access → 404 (never 403; do not confirm the resource exists to a non-owner org).
- Duplicate domain in org → 409 via the unique constraint, surfaced as a friendly message.
- Invalid / non-http(s) URL → 400 at the Zod boundary before any DB work.
- Insufficient role → 403 from `RolesGuard`.
- Worker infra fault (DNS server error, fetch timeout) → rethrow → BullMQ retry with backoff.
- Token genuinely absent → `status = failed` (a normal outcome), no retry; the user fixes their DNS
  or tag and re-verifies.

## Testing (90%+ on business logic)

- **types:** schema validation — valid/invalid inputs, path-length caps, url scheme rejection,
  method/frequency enums, job schema.
- **api:** repository org-scoping (a query for org B never returns org A's rows); service create
  (token issue, normalization) and verify (enqueue with correct payload); controller RBAC
  (401 unauth, 403 member-mutating, 200 admin); e2e create → list → verify-enqueues; duplicate → 409;
  cross-org GET → 404.
- **worker:** both strategies with mocked `dns`/`fetch` — token found → true, absent → false, infra
  throw → rethrow (not a `false`); processor writes `verified` vs `failed`; malformed job rejected.
- **web:** add-website form validation; verification panel state transitions (pick method → token
  shown → verify → badge); scan-config form validation.

## Config

- `WEBSITE_VERIFY_QUEUE` constant in `@wintel/types`.
- Worker already has `DATABASE_URL` (foundation). No new environment variables this slice.
- Fetch timeout and max-response-size are worker module constants.

## Build Order (feeds the implementation plan)

1. Data model + migration (`@wintel/database`).
2. Contracts: `website.ts` + `website-jobs.ts` (`@wintel/types`).
3. API `modules/websites` (repository → service → controller → producer) + tests.
4. Worker `DatabaseModule`, verification strategies, processor + tests.
5. `@wintel/ui` primitives (Select/Card/Textarea) + tests.
6. Web pages (list, add, detail with verify panel + scan-config form) + tests.
7. Full-stack verification (add → verify via Mailpit-free DNS/meta against a local fixture) + CI.
