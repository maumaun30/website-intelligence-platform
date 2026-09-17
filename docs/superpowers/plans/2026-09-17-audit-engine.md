# Audit Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit every completed scan automatically against 15 technical-SEO rules, store issues with severity counts, let admins re-run the latest scan's audit, and show grouped issues live in the web app.

**Architecture:** Two new Prisma models (`Audit`, `Issue`). Audit/issue contracts and the rule catalog in `@wintel/types`. In the worker, pure rules run over an `AuditContext` built by a batched loader that extracts small per-page facts from stored HTML; a `ScanAuditProcessor` owns audit state and the crawl processor creates and enqueues the audit. A NestJS `modules/audits` feature serves audits, issues, the catalog, and re-runs. The scan panel gains an audit section.

**Tech Stack:** TypeScript, NestJS 11, Prisma 6, BullMQ, Zod 4, cheerio 1.2, Node `zlib`, Next.js 15, TanStack Query 5, vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-audit-engine-design.md`

## Global Constraints

- **Node/pnpm:** prefix every shell command — including `git commit` — with `. ~/.nvm/nvm.sh && nvm use 22 >/dev/null`.
- **Tests:** `pnpm --filter @wintel/<pkg> exec vitest run [path]`; infra (`pnpm infra:up`) must be running for api/worker tests.
- **Prisma:** `pnpm --filter @wintel/database db:migrate:dev --name <name>`, then `pnpm --filter @wintel/database build`.
- **Types rebuild:** after changing `@wintel/types` run `pnpm --filter @wintel/types build`.
- **After any filtered `pnpm add`:** run a root `pnpm install` (no new dependencies are planned).
- **DI imports:** injected classes are value imports, never `import type`. Verify after each commit.
- **Tenant boundary:** audits and issues are reached only through an org-checked scan; `Audit.organizationId` is also filtered in the API repository. Cross-org → 404.
- **Error bodies:** machine codes go in `details: { code }`.
- **Strict index access:** use `arr[0]!` in tests.
- **Constants (spec):** `AUDIT_BATCH_SIZE = 50`, `ISSUE_INSERT_BATCH = 500`, `SLOW_RESPONSE_MS = 2000`, `LARGE_PAGE_BYTES = 1_000_000`, `TITLE_MIN_LENGTH = 10`, `TITLE_MAX_LENGTH = 60`, `AUDIT_STALE_MS = 600_000`; issue list limit default 50, max 200; poll 2 s; audit jobs `attempts: 1`.
- **"HTML page"** = `statusCode` 200–299, content type containing `text/html`, stored readable content. In code: a page that has an entry in `ctx.facts`.
- **Link status:** a target is broken when `statusCode >= 400`, or `statusCode === null && error !== null`. Links to URLs with no `Page` row in the scan are ignored.
- **Commits:** one per task, message ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SJ3KW2BdV6HozzjAbgPRqy
  ```

---

### Task 1: Audit and Issue models + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: generated migration `*_add_audit_models`

**Interfaces:**
- Produces: `audit`, `issue` delegates; enums `AuditStatus`, `IssueSeverity`; relations `Scan.audit`, `Page.issues`.

- [ ] **Step 1: Add models**

Add `audit Audit?` to `Scan` (after `pages Page[]`) and `issues Issue[]` to `Page` (after `links PageLink[]`). Append:

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

- [ ] **Step 2: Migrate, build, typecheck dependents**

Run: `. ~/.nvm/nvm.sh && nvm use 22 >/dev/null && pnpm --filter @wintel/database db:migrate:dev --name add_audit_models && pnpm --filter @wintel/database build && pnpm --filter @wintel/api typecheck && pnpm --filter @wintel/worker typecheck`
Expected: migration applied; all green.

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma
git commit -m "feat(database): add audit and issue models"
```

---

### Task 2: Audit contracts and rule catalog (`@wintel/types`)

**Files:**
- Create: `packages/types/src/audit.ts`, `packages/types/src/audit.test.ts`
- Create: `packages/types/src/audit-jobs.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `AUDIT_STATUSES`, `ACTIVE_AUDIT_STATUSES`, `ISSUE_SEVERITIES`, `AUDIT_RULE_IDS`, `AUDIT_RULES: Readonly<Record<AuditRuleId, AuditRuleDefinition>>` (`{ title, severity, description }`), `ISSUE_LIST_DEFAULT_LIMIT = 50`, `ISSUE_LIST_MAX_LIMIT = 200`; schemas `auditRuleSchema`, `ruleCountSchema`, `auditSchema` (includes `ruleCounts`), `issueSchema` (includes `page: { url, path }`), `issueListQuerySchema`, `issueListSchema`; types `AuditStatus`, `IssueSeverity`, `AuditRuleId`, `AuditRuleDefinition`, `AuditRule`, `RuleCount`, `Audit`, `Issue`, `IssueListQuery`, `IssueList`. `audit-jobs.ts`: `SCAN_AUDIT_QUEUE = 'scan-audit'`, `AUDIT_STALE_MS = 600_000`, `scanAuditJobSchema` / `ScanAuditJob` = `{ auditId, scanId }`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';

import { AUDIT_RULE_IDS, AUDIT_RULES, issueListQuerySchema } from './audit';
import { scanAuditJobSchema } from './audit-jobs';

describe('AUDIT_RULES', () => {
  it('describes exactly the rule ids, with the spec severities', () => {
    expect(Object.keys(AUDIT_RULES).sort()).toEqual([...AUDIT_RULE_IDS].sort());
    expect(AUDIT_RULE_IDS).toHaveLength(15);
    expect(AUDIT_RULES['broken-internal-link'].severity).toBe('critical');
    expect(AUDIT_RULES['server-error'].severity).toBe('critical');
    expect(AUDIT_RULES['duplicate-title'].severity).toBe('warning');
    expect(AUDIT_RULES['noindex'].severity).toBe('notice');
  });
});

describe('issueListQuerySchema', () => {
  it('coerces pagination and accepts optional filters', () => {
    expect(issueListQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(
      issueListQuerySchema.parse({ severity: 'critical', ruleId: 'missing-h1', limit: '5' }),
    ).toEqual({ severity: 'critical', ruleId: 'missing-h1', limit: 5, offset: 0 });
  });

  it('rejects unknown rules and severities', () => {
    expect(issueListQuerySchema.safeParse({ ruleId: 'nope' }).success).toBe(false);
    expect(issueListQuerySchema.safeParse({ severity: 'fatal' }).success).toBe(false);
  });
});

describe('scanAuditJobSchema', () => {
  it('requires both ids', () => {
    expect(scanAuditJobSchema.safeParse({ auditId: 'a', scanId: 's' }).success).toBe(true);
    expect(scanAuditJobSchema.safeParse({ auditId: 'a' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fail** (`pnpm --filter @wintel/types exec vitest run src/audit.test.ts` → cannot resolve).

- [ ] **Step 3: Implement `audit.ts`**

```ts
import { z } from 'zod';

export const AUDIT_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
/** An audit in one of these states may still change; the web app polls it. */
export const ACTIVE_AUDIT_STATUSES = ['queued', 'running'] as const;
/** Ordered most to least severe; Postgres sorts the enum in this order too. */
export const ISSUE_SEVERITIES = ['critical', 'warning', 'notice'] as const;

export const AUDIT_RULE_IDS = [
  'broken-internal-link',
  'server-error',
  'client-error',
  'missing-title',
  'duplicate-title',
  'missing-meta-description',
  'missing-h1',
  'slow-response',
  'redirected-link',
  'title-length',
  'duplicate-meta-description',
  'multiple-h1',
  'missing-canonical',
  'noindex',
  'large-page',
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type AuditRuleId = (typeof AUDIT_RULE_IDS)[number];

export interface AuditRuleDefinition {
  title: string;
  severity: IssueSeverity;
  description: string;
}

/** The rule catalog. The worker implements these ids; API and web read titles and severities. */
export const AUDIT_RULES: Readonly<Record<AuditRuleId, AuditRuleDefinition>> = {
  'broken-internal-link': {
    title: 'Broken internal link',
    severity: 'critical',
    description: 'The page links to a page on this site that returned an error or could not be fetched.',
  },
  'server-error': {
    title: 'Server error',
    severity: 'critical',
    description: 'The page returned a 5xx status or could not be fetched at all.',
  },
  'client-error': {
    title: 'Page not found or forbidden',
    severity: 'warning',
    description: 'The page returned a 4xx status.',
  },
  'missing-title': {
    title: 'Missing title',
    severity: 'warning',
    description: 'The page has no <title>, so search results have nothing to show as its headline.',
  },
  'duplicate-title': {
    title: 'Duplicate title',
    severity: 'warning',
    description: 'Several pages share this title, which makes them hard to tell apart in search results.',
  },
  'missing-meta-description': {
    title: 'Missing meta description',
    severity: 'warning',
    description: 'The page has no meta description, so search engines pick a snippet themselves.',
  },
  'missing-h1': {
    title: 'Missing H1',
    severity: 'warning',
    description: 'The page has no <h1> heading describing its main topic.',
  },
  'slow-response': {
    title: 'Slow response',
    severity: 'warning',
    description: 'The server took more than 2 seconds to respond.',
  },
  'redirected-link': {
    title: 'Link to a redirect',
    severity: 'notice',
    description: 'The page links to a URL that redirects; linking to the final URL saves a round trip.',
  },
  'title-length': {
    title: 'Title too short or too long',
    severity: 'notice',
    description: 'Titles under 10 or over 60 characters tend to be uninformative or truncated.',
  },
  'duplicate-meta-description': {
    title: 'Duplicate meta description',
    severity: 'notice',
    description: 'Several pages share this meta description.',
  },
  'multiple-h1': {
    title: 'Multiple H1 headings',
    severity: 'notice',
    description: 'The page has more than one <h1>, which blurs its main topic.',
  },
  'missing-canonical': {
    title: 'Missing canonical URL',
    severity: 'notice',
    description: 'The page does not declare a canonical URL, so duplicate URLs may compete.',
  },
  noindex: {
    title: 'Excluded from search (noindex)',
    severity: 'notice',
    description: 'The page asks search engines not to index it. Check this is intentional.',
  },
  'large-page': {
    title: 'Large page',
    severity: 'notice',
    description: 'The page is larger than 1 MB.',
  },
};

export const ISSUE_LIST_DEFAULT_LIMIT = 50;
export const ISSUE_LIST_MAX_LIMIT = 200;

export const auditRuleSchema = z.object({
  id: z.enum(AUDIT_RULE_IDS),
  title: z.string(),
  severity: z.enum(ISSUE_SEVERITIES),
  description: z.string(),
});

export const ruleCountSchema = z.object({
  ruleId: z.enum(AUDIT_RULE_IDS),
  severity: z.enum(ISSUE_SEVERITIES),
  count: z.number().int(),
});

/** An audit of one scan, with per-rule counts for grouping. Dates are ISO strings. */
export const auditSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  organizationId: z.string(),
  status: z.enum(AUDIT_STATUSES),
  criticalCount: z.number().int(),
  warningCount: z.number().int(),
  noticeCount: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ruleCounts: z.array(ruleCountSchema),
});

export const issueSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  pageId: z.string(),
  ruleId: z.enum(AUDIT_RULE_IDS),
  severity: z.enum(ISSUE_SEVERITIES),
  message: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  page: z.object({ url: z.string(), path: z.string() }),
});

export const issueListQuerySchema = z.object({
  severity: z.enum(ISSUE_SEVERITIES).optional(),
  ruleId: z.enum(AUDIT_RULE_IDS).optional(),
  limit: z.coerce.number().int().min(1).max(ISSUE_LIST_MAX_LIMIT).default(ISSUE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export const issueListSchema = z.object({
  items: z.array(issueSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type AuditRule = z.infer<typeof auditRuleSchema>;
export type RuleCount = z.infer<typeof ruleCountSchema>;
export type Audit = z.infer<typeof auditSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type IssueListQuery = z.infer<typeof issueListQuerySchema>;
export type IssueList = z.infer<typeof issueListSchema>;
```

`audit-jobs.ts`:

```ts
import { z } from 'zod';

/** Name of the queue carrying audit jobs. The crawl processor and the API produce; the worker consumes. */
export const SCAN_AUDIT_QUEUE = 'scan-audit';

/** A queued or running audit untouched for this long has lost its job and may be re-queued. */
export const AUDIT_STALE_MS = 10 * 60 * 1000;

export const scanAuditJobSchema = z.object({
  auditId: z.string(),
  scanId: z.string(),
});

export type ScanAuditJob = z.infer<typeof scanAuditJobSchema>;
```

- [ ] **Step 4: Barrel** — append to `index.ts`:

```ts
export {
  ACTIVE_AUDIT_STATUSES,
  AUDIT_RULES,
  AUDIT_RULE_IDS,
  AUDIT_STATUSES,
  ISSUE_LIST_DEFAULT_LIMIT,
  ISSUE_LIST_MAX_LIMIT,
  ISSUE_SEVERITIES,
  auditRuleSchema,
  auditSchema,
  issueListQuerySchema,
  issueListSchema,
  issueSchema,
  ruleCountSchema,
} from './audit';
export type {
  Audit,
  AuditRule,
  AuditRuleDefinition,
  AuditRuleId,
  AuditStatus,
  Issue,
  IssueList,
  IssueListQuery,
  IssueSeverity,
  RuleCount,
} from './audit';
export { AUDIT_STALE_MS, SCAN_AUDIT_QUEUE, scanAuditJobSchema } from './audit-jobs';
export type { ScanAuditJob } from './audit-jobs';
```

- [ ] **Step 5: Test + gates + build** (`vitest run`, `typecheck`, `lint`, `build` for `@wintel/types`) — green.

- [ ] **Step 6: Commit** — `feat(types): add audit contracts and rule catalog`.

---

### Task 3: Page facts, audit context, rules, and runAudit (worker, pure)

**Files (all under `apps/worker/src/queues/scan-audit/`):**
- Create: `audit.constants.ts`, `page-facts.ts`, `page-facts.test.ts`, `audit-context.ts`
- Create: `rules/status-rules.ts`, `rules/link-rules.ts`, `rules/content-rules.ts`, `rules/index.ts`, `rules/rules.test.ts`
- Create: `run-audit.ts`, `run-audit.test.ts`

**Interfaces:**
- Produces:
  - `interface PageFacts { title: string | null; metaDescription: string | null; h1Count: number; hasCanonical: boolean; robotsContent: string | null }`, `extractPageFacts(html: string): PageFacts`.
  - `interface AuditPage { id; url; path; statusCode: number | null; contentType: string | null; byteSize: number | null; responseTimeMs: number | null; redirectedTo: string | null; error: string | null }`
  - `interface AuditLink { url: string; internal: boolean }`
  - `interface AuditContext { pages: AuditPage[]; facts: Map<string, PageFacts>; pageByUrl: Map<string, AuditPage>; links: Map<string, AuditLink[]> }`
  - `buildAuditContext(pages: AuditPage[], facts: Map<string, PageFacts>, links: Map<string, AuditLink[]>): AuditContext`
  - `interface IssueDraft { pageId: string; ruleId: AuditRuleId; message: string; evidence: Record<string, unknown> }`
  - `interface AuditRuleImplementation { id: AuditRuleId; evaluate(ctx: AuditContext): IssueDraft[] }`
  - `AUDIT_RULE_IMPLEMENTATIONS: readonly AuditRuleImplementation[]`
  - `interface AuditOutcome { issues: Array<IssueDraft & { severity: IssueSeverity }>; counts: Record<IssueSeverity, number> }`, `runAudit(ctx, rules?): AuditOutcome`.

- [ ] **Step 1: Failing facts test** — `page-facts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { extractPageFacts } from './page-facts';

describe('extractPageFacts', () => {
  it('extracts title, description, h1 count, canonical and robots', () => {
    const html = `<html><head>
      <title>  Acme   Home </title>
      <meta name="Description" content=" The best acme ">
      <link rel="canonical" href="https://acme.test/">
      <meta name="robots" content="NOINDEX, follow">
    </head><body><h1>A</h1><h1>B</h1></body></html>`;

    expect(extractPageFacts(html)).toEqual({
      title: 'Acme Home',
      metaDescription: 'The best acme',
      h1Count: 2,
      hasCanonical: true,
      robotsContent: 'NOINDEX, follow',
    });
  });

  it('treats empty values and href-less canonicals as absent', () => {
    const html =
      '<title> </title><meta name="description" content=""><link rel="canonical"><p>no heading</p>';

    expect(extractPageFacts(html)).toEqual({
      title: null,
      metaDescription: null,
      h1Count: 0,
      hasCanonical: false,
      robotsContent: null,
    });
  });
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement constants, facts, context**

`audit.constants.ts`:

```ts
export const AUDIT_BATCH_SIZE = 50;
export const ISSUE_INSERT_BATCH = 500;
export const SLOW_RESPONSE_MS = 2000;
export const LARGE_PAGE_BYTES = 1_000_000;
export const TITLE_MIN_LENGTH = 10;
export const TITLE_MAX_LENGTH = 60;
```

`page-facts.ts`:

```ts
import { load } from 'cheerio';

export interface PageFacts {
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  hasCanonical: boolean;
  robotsContent: string | null;
}

function clean(value: string | undefined): string | null {
  const collapsed = (value ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

/**
 * The handful of facts the rules need from a page's HTML. Extracted once per page so the HTML
 * itself can be dropped immediately — rules never see markup.
 */
export function extractPageFacts(html: string): PageFacts {
  const $ = load(html);
  const metaContent = (name: string) =>
    $('meta[name]')
      .filter((_index, element) => ($(element).attr('name') ?? '').toLowerCase() === name)
      .first()
      .attr('content');

  return {
    title: clean($('title').first().text()),
    metaDescription: clean(metaContent('description')),
    h1Count: $('h1').length,
    hasCanonical: clean($('link[rel="canonical"]').first().attr('href')) !== null,
    robotsContent: clean(metaContent('robots')),
  };
}
```

`audit-context.ts`:

```ts
import type { AuditRuleId } from '@wintel/types';

import type { PageFacts } from './page-facts';

export interface AuditPage {
  id: string;
  url: string;
  path: string;
  statusCode: number | null;
  contentType: string | null;
  byteSize: number | null;
  responseTimeMs: number | null;
  redirectedTo: string | null;
  error: string | null;
}

export interface AuditLink {
  url: string;
  internal: boolean;
}

/**
 * Everything the rules may look at. `facts` has an entry only for HTML pages (2xx, text/html,
 * readable stored content), so "is this an HTML page" is `facts.has(page.id)`.
 */
export interface AuditContext {
  pages: AuditPage[];
  facts: Map<string, PageFacts>;
  pageByUrl: Map<string, AuditPage>;
  links: Map<string, AuditLink[]>;
}

export interface IssueDraft {
  pageId: string;
  ruleId: AuditRuleId;
  message: string;
  evidence: Record<string, unknown>;
}

export interface AuditRuleImplementation {
  id: AuditRuleId;
  evaluate(ctx: AuditContext): IssueDraft[];
}

export function buildAuditContext(
  pages: AuditPage[],
  facts: Map<string, PageFacts>,
  links: Map<string, AuditLink[]>,
): AuditContext {
  return { pages, facts, links, pageByUrl: new Map(pages.map((page) => [page.url, page])) };
}

/** HTML pages paired with their facts, in page order. */
export function htmlPages(ctx: AuditContext): Array<{ page: AuditPage; facts: PageFacts }> {
  return ctx.pages.flatMap((page) => {
    const facts = ctx.facts.get(page.id);
    return facts ? [{ page, facts }] : [];
  });
}
```

- [ ] **Step 4: Run facts test — pass.**

- [ ] **Step 5: Failing rules test** — `rules/rules.test.ts`:

```ts
import { AUDIT_RULE_IDS, type AuditRuleId } from '@wintel/types';
import { describe, expect, it } from 'vitest';

import {
  type AuditContext,
  type AuditLink,
  type AuditPage,
  buildAuditContext,
} from '../audit-context';
import type { PageFacts } from '../page-facts';
import { AUDIT_RULE_IMPLEMENTATIONS } from './index';

function page(path: string, overrides: Partial<AuditPage> = {}): AuditPage {
  return {
    id: path,
    url: `https://acme.test${path}`,
    path,
    statusCode: 200,
    contentType: 'text/html',
    byteSize: 1000,
    responseTimeMs: 100,
    redirectedTo: null,
    error: null,
    ...overrides,
  };
}

function facts(overrides: Partial<PageFacts> = {}): PageFacts {
  return {
    title: 'A perfectly fine title',
    metaDescription: 'A description',
    h1Count: 1,
    hasCanonical: true,
    robotsContent: null,
    ...overrides,
  };
}

function context(
  entries: Array<{ page: AuditPage; facts?: PageFacts; links?: string[] }>,
): AuditContext {
  const factMap = new Map<string, PageFacts>();
  const linkMap = new Map<string, AuditLink[]>();
  for (const entry of entries) {
    if (entry.facts) {
      factMap.set(entry.page.id, entry.facts);
    }
    linkMap.set(
      entry.page.id,
      (entry.links ?? []).map((url) => ({ url, internal: url.startsWith('https://acme.test') })),
    );
  }
  return buildAuditContext(entries.map((entry) => entry.page), factMap, linkMap);
}

function run(ruleId: AuditRuleId, ctx: AuditContext) {
  const rule = AUDIT_RULE_IMPLEMENTATIONS.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new Error(`no implementation for ${ruleId}`);
  }
  return rule.evaluate(ctx);
}

describe('rule registry', () => {
  it('implements every catalog rule exactly once', () => {
    expect(AUDIT_RULE_IMPLEMENTATIONS.map((rule) => rule.id).sort()).toEqual(
      [...AUDIT_RULE_IDS].sort(),
    );
  });
});

describe('status rules', () => {
  it('server-error fires on 5xx and on request errors, client-error only on 4xx', () => {
    const ctx = context([
      { page: page('/500', { statusCode: 503 }) },
      { page: page('/down', { statusCode: null, error: 'ECONNREFUSED' }) },
      { page: page('/404', { statusCode: 404 }) },
      { page: page('/ok') },
    ]);

    expect(run('server-error', ctx).map((issue) => issue.pageId)).toEqual(['/500', '/down']);
    expect(run('client-error', ctx).map((issue) => issue.pageId)).toEqual(['/404']);
  });

  it('flags slow and large pages above the thresholds only', () => {
    const ctx = context([
      { page: page('/slow', { responseTimeMs: 2001 }) },
      { page: page('/edge', { responseTimeMs: 2000, byteSize: 1_000_000 }) },
      { page: page('/big', { byteSize: 1_000_001 }) },
    ]);

    expect(run('slow-response', ctx)).toEqual([
      expect.objectContaining({ pageId: '/slow', evidence: { responseTimeMs: 2001 } }),
    ]);
    expect(run('large-page', ctx).map((issue) => issue.pageId)).toEqual(['/big']);
  });
});

describe('link rules', () => {
  it('reports links to crawled pages that failed, and ignores unknown and healthy targets', () => {
    const ctx = context([
      {
        page: page('/'),
        facts: facts(),
        links: [
          'https://acme.test/missing',
          'https://acme.test/down',
          'https://acme.test/ok',
          'https://acme.test/never-crawled',
          'https://other.test/broken',
          'https://acme.test/huge',
        ],
      },
      { page: page('/missing', { statusCode: 404 }) },
      { page: page('/down', { statusCode: null, error: 'ETIMEDOUT' }) },
      { page: page('/ok') },
      { page: page('/huge', { error: 'Response exceeded the 2 MB limit' }) },
    ]);

    const issues = run('broken-internal-link', ctx);

    expect(issues.map((issue) => issue.evidence.targetUrl)).toEqual([
      'https://acme.test/missing',
      'https://acme.test/down',
    ]);
    expect(issues.every((issue) => issue.pageId === '/')).toBe(true);
  });

  it('reports links to redirecting pages', () => {
    const ctx = context([
      { page: page('/'), links: ['https://acme.test/old'] },
      { page: page('/old', { redirectedTo: 'https://acme.test/new' }) },
    ]);

    expect(run('redirected-link', ctx)).toEqual([
      expect.objectContaining({
        pageId: '/',
        evidence: { targetUrl: 'https://acme.test/old', redirectedTo: 'https://acme.test/new' },
      }),
    ]);
  });
});

describe('content rules', () => {
  it('only evaluates HTML pages', () => {
    const ctx = context([{ page: page('/pdf', { contentType: 'application/pdf' }) }]);

    for (const ruleId of ['missing-title', 'missing-h1', 'missing-canonical'] as const) {
      expect(run(ruleId, ctx)).toEqual([]);
    }
  });

  it('keeps missing-title and title-length mutually exclusive', () => {
    const ctx = context([
      { page: page('/none'), facts: facts({ title: null }) },
      { page: page('/short'), facts: facts({ title: 'Hi' }) },
      { page: page('/long'), facts: facts({ title: 'x'.repeat(61) }) },
      { page: page('/fine'), facts: facts({ title: 'Exactly ten' }) },
    ]);

    expect(run('missing-title', ctx).map((issue) => issue.pageId)).toEqual(['/none']);
    expect(run('title-length', ctx).map((issue) => issue.pageId)).toEqual(['/short', '/long']);
  });

  it('flags every page sharing a title or description, with the duplicate count', () => {
    const ctx = context([
      { page: page('/a'), facts: facts({ title: 'Same title here', metaDescription: 'Same' }) },
      { page: page('/b'), facts: facts({ title: 'Same title here', metaDescription: 'Same' }) },
      { page: page('/c'), facts: facts({ title: 'Unique title here', metaDescription: null }) },
    ]);

    expect(run('duplicate-title', ctx)).toEqual([
      expect.objectContaining({ pageId: '/a', evidence: { title: 'Same title here', duplicateCount: 2 } }),
      expect.objectContaining({ pageId: '/b', evidence: { title: 'Same title here', duplicateCount: 2 } }),
    ]);
    expect(run('duplicate-meta-description', ctx).map((issue) => issue.pageId)).toEqual(['/a', '/b']);
    expect(run('missing-meta-description', ctx).map((issue) => issue.pageId)).toEqual(['/c']);
  });

  it('keeps missing-h1 and multiple-h1 mutually exclusive', () => {
    const ctx = context([
      { page: page('/zero'), facts: facts({ h1Count: 0 }) },
      { page: page('/one'), facts: facts({ h1Count: 1 }) },
      { page: page('/two'), facts: facts({ h1Count: 2 }) },
    ]);

    expect(run('missing-h1', ctx).map((issue) => issue.pageId)).toEqual(['/zero']);
    expect(run('multiple-h1', ctx)).toEqual([
      expect.objectContaining({ pageId: '/two', evidence: { count: 2 } }),
    ]);
  });

  it('flags missing canonicals and noindex pages', () => {
    const ctx = context([
      { page: page('/no-canonical'), facts: facts({ hasCanonical: false }) },
      { page: page('/hidden'), facts: facts({ robotsContent: 'NoIndex, follow' }) },
      { page: page('/follow'), facts: facts({ robotsContent: 'index, follow' }) },
    ]);

    expect(run('missing-canonical', ctx).map((issue) => issue.pageId)).toEqual(['/no-canonical']);
    expect(run('noindex', ctx)).toEqual([
      expect.objectContaining({ pageId: '/hidden', evidence: { content: 'NoIndex, follow' } }),
    ]);
  });
});
```

- [ ] **Step 6: Run — fail.**

- [ ] **Step 7: Implement rules**

`rules/status-rules.ts`:

```ts
import { LARGE_PAGE_BYTES, SLOW_RESPONSE_MS } from '../audit.constants';
import type { AuditPage, AuditRuleImplementation } from '../audit-context';

/** A request that failed outright or a 5xx. Shared with the link rules' notion of "broken". */
export function isServerFailure(page: AuditPage): boolean {
  return (page.statusCode !== null && page.statusCode >= 500) || (page.statusCode === null && page.error !== null);
}

export const serverErrorRule: AuditRuleImplementation = {
  id: 'server-error',
  evaluate: (ctx) =>
    ctx.pages.filter(isServerFailure).map((page) => ({
      pageId: page.id,
      ruleId: 'server-error',
      message:
        page.statusCode === null
          ? `The page could not be fetched: ${page.error ?? 'unknown error'}`
          : `The page returned ${page.statusCode}`,
      evidence: { statusCode: page.statusCode, error: page.error },
    })),
};

export const clientErrorRule: AuditRuleImplementation = {
  id: 'client-error',
  evaluate: (ctx) =>
    ctx.pages
      .filter((page) => page.statusCode !== null && page.statusCode >= 400 && page.statusCode < 500)
      .map((page) => ({
        pageId: page.id,
        ruleId: 'client-error',
        message: `The page returned ${page.statusCode}`,
        evidence: { statusCode: page.statusCode },
      })),
};

export const slowResponseRule: AuditRuleImplementation = {
  id: 'slow-response',
  evaluate: (ctx) =>
    ctx.pages
      .filter((page) => page.responseTimeMs !== null && page.responseTimeMs > SLOW_RESPONSE_MS)
      .map((page) => ({
        pageId: page.id,
        ruleId: 'slow-response',
        message: `The server took ${page.responseTimeMs} ms to respond`,
        evidence: { responseTimeMs: page.responseTimeMs },
      })),
};

export const largePageRule: AuditRuleImplementation = {
  id: 'large-page',
  evaluate: (ctx) =>
    ctx.pages
      .filter((page) => page.byteSize !== null && page.byteSize > LARGE_PAGE_BYTES)
      .map((page) => ({
        pageId: page.id,
        ruleId: 'large-page',
        message: `The page is ${(page.byteSize! / 1_000_000).toFixed(1)} MB`,
        evidence: { byteSize: page.byteSize },
      })),
};
```

`rules/link-rules.ts`:

```ts
import type { AuditContext, AuditPage, AuditRuleImplementation, IssueDraft } from '../audit-context';

function isBroken(page: AuditPage): boolean {
  return (page.statusCode !== null && page.statusCode >= 400) || (page.statusCode === null && page.error !== null);
}

/** Internal links whose target was crawled in this scan. Unknown targets are never judged. */
function* crawledTargets(ctx: AuditContext): Generator<{ source: AuditPage; target: AuditPage }> {
  for (const source of ctx.pages) {
    for (const link of ctx.links.get(source.id) ?? []) {
      const target = link.internal ? ctx.pageByUrl.get(link.url) : undefined;
      if (target) {
        yield { source, target };
      }
    }
  }
}

export const brokenInternalLinkRule: AuditRuleImplementation = {
  id: 'broken-internal-link',
  evaluate: (ctx) => {
    const issues: IssueDraft[] = [];
    for (const { source, target } of crawledTargets(ctx)) {
      if (isBroken(target)) {
        issues.push({
          pageId: source.id,
          ruleId: 'broken-internal-link',
          message:
            target.statusCode === null
              ? `Links to ${target.url}, which could not be fetched`
              : `Links to ${target.url}, which returned ${target.statusCode}`,
          evidence: { targetUrl: target.url, statusCode: target.statusCode, error: target.error },
        });
      }
    }
    return issues;
  },
};

export const redirectedLinkRule: AuditRuleImplementation = {
  id: 'redirected-link',
  evaluate: (ctx) => {
    const issues: IssueDraft[] = [];
    for (const { source, target } of crawledTargets(ctx)) {
      if (target.redirectedTo !== null) {
        issues.push({
          pageId: source.id,
          ruleId: 'redirected-link',
          message: `Links to ${target.url}, which redirects to ${target.redirectedTo}`,
          evidence: { targetUrl: target.url, redirectedTo: target.redirectedTo },
        });
      }
    }
    return issues;
  },
};
```

`rules/content-rules.ts`:

```ts
import type { AuditRuleId } from '@wintel/types';

import { TITLE_MAX_LENGTH, TITLE_MIN_LENGTH } from '../audit.constants';
import { type AuditContext, type AuditRuleImplementation, type IssueDraft, htmlPages } from '../audit-context';
import type { PageFacts } from '../page-facts';

function pageRule(
  id: AuditRuleId,
  check: (facts: PageFacts) => { message: string; evidence: Record<string, unknown> } | null,
): AuditRuleImplementation {
  return {
    id,
    evaluate: (ctx) =>
      htmlPages(ctx).flatMap(({ page, facts }) => {
        const finding = check(facts);
        return finding ? [{ pageId: page.id, ruleId: id, ...finding }] : [];
      }),
  };
}

function duplicateRule(
  id: AuditRuleId,
  field: 'title' | 'metaDescription',
  evidenceKey: 'title' | 'description',
  label: string,
): AuditRuleImplementation {
  return {
    id,
    evaluate: (ctx: AuditContext) => {
      const pages = htmlPages(ctx);
      const counts = new Map<string, number>();
      for (const { facts } of pages) {
        const value = facts[field];
        if (value !== null) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      return pages.flatMap(({ page, facts }): IssueDraft[] => {
        const value = facts[field];
        const duplicateCount = value === null ? 0 : (counts.get(value) ?? 0);
        return duplicateCount > 1
          ? [
              {
                pageId: page.id,
                ruleId: id,
                message: `${duplicateCount} pages share the ${label} "${value}"`,
                evidence: { [evidenceKey]: value, duplicateCount },
              },
            ]
          : [];
      });
    },
  };
}

export const missingTitleRule = pageRule('missing-title', (facts) =>
  facts.title === null ? { message: 'The page has no title', evidence: {} } : null,
);

export const titleLengthRule = pageRule('title-length', (facts) => {
  if (facts.title === null) {
    return null;
  }
  const length = facts.title.length;
  if (length >= TITLE_MIN_LENGTH && length <= TITLE_MAX_LENGTH) {
    return null;
  }
  return {
    message: `The title is ${length} characters (aim for ${TITLE_MIN_LENGTH}–${TITLE_MAX_LENGTH})`,
    evidence: { title: facts.title, length },
  };
});

export const duplicateTitleRule = duplicateRule('duplicate-title', 'title', 'title', 'title');

export const missingMetaDescriptionRule = pageRule('missing-meta-description', (facts) =>
  facts.metaDescription === null ? { message: 'The page has no meta description', evidence: {} } : null,
);

export const duplicateMetaDescriptionRule = duplicateRule(
  'duplicate-meta-description',
  'metaDescription',
  'description',
  'meta description',
);

export const missingH1Rule = pageRule('missing-h1', (facts) =>
  facts.h1Count === 0 ? { message: 'The page has no H1 heading', evidence: {} } : null,
);

export const multipleH1Rule = pageRule('multiple-h1', (facts) =>
  facts.h1Count > 1
    ? { message: `The page has ${facts.h1Count} H1 headings`, evidence: { count: facts.h1Count } }
    : null,
);

export const missingCanonicalRule = pageRule('missing-canonical', (facts) =>
  facts.hasCanonical ? null : { message: 'The page declares no canonical URL', evidence: {} },
);

export const noindexRule = pageRule('noindex', (facts) =>
  facts.robotsContent !== null && facts.robotsContent.toLowerCase().includes('noindex')
    ? { message: 'The page asks search engines not to index it', evidence: { content: facts.robotsContent } }
    : null,
);
```

`rules/index.ts`:

```ts
import type { AuditRuleImplementation } from '../audit-context';
import {
  duplicateMetaDescriptionRule,
  duplicateTitleRule,
  missingCanonicalRule,
  missingH1Rule,
  missingMetaDescriptionRule,
  missingTitleRule,
  multipleH1Rule,
  noindexRule,
  titleLengthRule,
} from './content-rules';
import { brokenInternalLinkRule, redirectedLinkRule } from './link-rules';
import { clientErrorRule, largePageRule, serverErrorRule, slowResponseRule } from './status-rules';

/** Every rule the engine runs. The registry test keeps this in lockstep with AUDIT_RULE_IDS. */
export const AUDIT_RULE_IMPLEMENTATIONS: readonly AuditRuleImplementation[] = [
  brokenInternalLinkRule,
  serverErrorRule,
  clientErrorRule,
  missingTitleRule,
  duplicateTitleRule,
  missingMetaDescriptionRule,
  missingH1Rule,
  slowResponseRule,
  redirectedLinkRule,
  titleLengthRule,
  duplicateMetaDescriptionRule,
  multipleH1Rule,
  missingCanonicalRule,
  noindexRule,
  largePageRule,
];
```

> Implementation note: `link-rules.ts` defines its own `isBroken` rather than importing `isServerFailure`, because "broken target" includes 4xx. If lint flags the unused export `isServerFailure`, keep it exported — `serverErrorRule` uses it.

- [ ] **Step 8: Run rules test — pass.**

- [ ] **Step 9: Failing runAudit test** — `run-audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildAuditContext } from './audit-context';
import { runAudit } from './run-audit';

describe('runAudit', () => {
  it('attaches catalog severities and counts issues by severity', () => {
    const ctx = buildAuditContext([], new Map(), new Map());
    const rules = [
      { id: 'server-error' as const, evaluate: () => [{ pageId: 'p1', ruleId: 'server-error' as const, message: 'm', evidence: {} }] },
      {
        id: 'missing-h1' as const,
        evaluate: () => [
          { pageId: 'p1', ruleId: 'missing-h1' as const, message: 'm', evidence: {} },
          { pageId: 'p2', ruleId: 'missing-h1' as const, message: 'm', evidence: {} },
        ],
      },
    ];

    const outcome = runAudit(ctx, rules);

    expect(outcome.counts).toEqual({ critical: 1, warning: 2, notice: 0 });
    expect(outcome.issues.map((issue) => issue.severity)).toEqual(['critical', 'warning', 'warning']);
  });
});
```

- [ ] **Step 10: Implement `run-audit.ts`**

```ts
import { AUDIT_RULES, type IssueSeverity } from '@wintel/types';

import type { AuditContext, AuditRuleImplementation, IssueDraft } from './audit-context';
import { AUDIT_RULE_IMPLEMENTATIONS } from './rules';

export interface AuditOutcome {
  issues: Array<IssueDraft & { severity: IssueSeverity }>;
  counts: Record<IssueSeverity, number>;
}

/** Runs every rule over the context. Pure: no I/O, so the whole engine is testable in memory. */
export function runAudit(
  ctx: AuditContext,
  rules: readonly AuditRuleImplementation[] = AUDIT_RULE_IMPLEMENTATIONS,
): AuditOutcome {
  const counts: Record<IssueSeverity, number> = { critical: 0, warning: 0, notice: 0 };
  const issues = rules.flatMap((rule) =>
    rule.evaluate(ctx).map((draft) => {
      const severity = AUDIT_RULES[draft.ruleId].severity;
      counts[severity]++;
      return { ...draft, severity };
    }),
  );
  return { issues, counts };
}
```

- [ ] **Step 11: Run folder tests + worker typecheck + lint — green.**

- [ ] **Step 12: Commit** — `feat(worker): add audit rules over extracted page facts`.

---

### Task 4: Audit loader, processor, worker producer, crawl hook

**Files:**
- Create: `apps/worker/src/queues/scan-audit/audit-context-loader.ts`
- Create: `apps/worker/src/queues/scan-audit/scan-audit-queue.service.ts`
- Create: `apps/worker/src/queues/scan-audit/scan-audit.processor.ts`
- Create: `apps/worker/src/queues/scan-audit/scan-audit.module.ts`
- Test: `apps/worker/src/queues/scan-audit/scan-audit.processor.test.ts` (real Postgres)
- Modify: `apps/worker/src/queues/website-crawl/website-crawl.processor.ts`, `website-crawl.processor.test.ts`, `website-crawl.module.ts`
- Modify: `apps/worker/src/worker.module.ts`

**Interfaces:**
- Consumes: Task 3 exports; `PrismaService`; `SCAN_AUDIT_QUEUE`, `scanAuditJobSchema`, `ScanAuditJob`.
- Produces:
  - `loadAuditContext(client: PrismaClient, scanId: string): Promise<{ context: AuditContext; unreadableContent: number }>`; `AUDIT_CONTEXT_LOADER` symbol; `type AuditContextLoaderFn = typeof loadAuditContext`.
  - `ScanAuditQueueService` (worker): `createQueuedAudit(scanId: string, organizationId: string): Promise<{ id: string; scanId: string }>`, `enqueue(audit: { id: string; scanId: string }): Promise<void>`.
  - `ScanAuditProcessor.process(job)`.
  - `WebsiteCrawlProcessor` constructor becomes `(prisma, createRunner, auditQueue: ScanAuditQueueService, logger)`.

- [ ] **Step 1: Failing processor integration test**

```ts
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadAuditContext } from './audit-context-loader';
import { ScanAuditProcessor } from './scan-audit.processor';

let prisma: PrismaClient;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const html = (title: string, description: string, body = '<h1>Heading</h1>') =>
  `<html><head><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="/"></head><body>${body}</body></html>`;

async function seedAudit() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({ data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true } });
  await prisma.organization.create({ data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` } });
  const website = await prisma.website.create({
    data: {
      organizationId,
      createdById: userId,
      name: 'Audit',
      url: 'https://audit.test',
      domain: `audit-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
      verificationStatus: 'verified',
    },
  });
  const scan = await prisma.scan.create({
    data: { websiteId: website.id, organizationId, status: 'completed', stopReason: 'finished' },
  });

  const pages = [
    { path: '/', statusCode: 200, html: html('Home page title', 'Home description') },
    {
      path: '/about',
      statusCode: 200,
      html: html('Home page title', 'About description', '<p>no heading</p>'),
    },
    { path: '/gone', statusCode: 404, html: null },
  ];
  const ids: Record<string, string> = {};
  for (const entry of pages) {
    const created = await prisma.page.create({
      data: {
        scanId: scan.id,
        url: `https://audit.test${entry.path}`,
        path: entry.path,
        depth: entry.path === '/' ? 0 : 1,
        statusCode: entry.statusCode,
        contentType: 'text/html',
        byteSize: 100,
        responseTimeMs: 10,
      },
    });
    ids[entry.path] = created.id;
    if (entry.html) {
      await prisma.pageContent.create({ data: { pageId: created.id, html: gzipSync(entry.html) } });
    }
  }
  await prisma.pageLink.createMany({
    data: [
      { pageId: ids['/']!, url: 'https://audit.test/about', internal: true },
      { pageId: ids['/']!, url: 'https://audit.test/gone', internal: true },
      { pageId: ids['/']!, url: 'https://audit.test/unknown', internal: true },
    ],
  });

  const audit = await prisma.audit.create({ data: { scanId: scan.id, organizationId } });
  return { audit, ids, job: { data: { auditId: audit.id, scanId: scan.id } } as Job };
}

function processor(loader = loadAuditContext) {
  return new ScanAuditProcessor({ client: prisma } as never, loader, logger as never);
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ScanAuditProcessor', () => {
  it('audits stored pages and records issues and counts', async () => {
    const { audit, ids, job } = await seedAudit();

    await processor().process(job);

    const stored = await prisma.audit.findUniqueOrThrow({ where: { id: audit.id } });
    expect(stored).toMatchObject({ status: 'completed', criticalCount: 1, warningCount: 4, noticeCount: 0 });

    const issues = await prisma.issue.findMany({ where: { auditId: audit.id } });
    const summary = issues.map((issue) => `${issue.ruleId}@${issue.pageId}`).sort();
    expect(summary).toEqual(
      [
        `broken-internal-link@${ids['/']}`,
        `client-error@${ids['/gone']}`,
        `duplicate-title@${ids['/']}`,
        `duplicate-title@${ids['/about']}`,
        `missing-h1@${ids['/about']}`,
      ].sort(),
    );
  });

  it('replaces issues on a re-run instead of appending', async () => {
    const { audit, job } = await seedAudit();
    await processor().process(job);
    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'queued' } });

    await processor().process(job);

    expect(await prisma.issue.count({ where: { auditId: audit.id } })).toBe(5);
  });

  it('skips an audit that is not queued', async () => {
    const { audit, job } = await seedAudit();
    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'running' } });
    const loader = vi.fn(loadAuditContext);

    await processor(loader).process(job);

    expect(loader).not.toHaveBeenCalled();
  });

  it('marks the audit failed, keeps prior issues, and rethrows', async () => {
    const { audit, job } = await seedAudit();
    await processor().process(job);
    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'queued' } });

    await expect(
      processor(() => Promise.reject(new Error('loader exploded'))).process(job),
    ).rejects.toThrow('loader exploded');

    const stored = await prisma.audit.findUniqueOrThrow({ where: { id: audit.id } });
    expect(stored).toMatchObject({ status: 'failed', error: 'loader exploded' });
    expect(await prisma.issue.count({ where: { auditId: audit.id } })).toBe(5);
  });
});
```

> Expected issues for the seed: `/` links to `/gone` (404) → `broken-internal-link` on `/` (critical); `/gone` → `client-error`; `/` and `/about` share a title → two `duplicate-title`; `/about` has no H1 → `missing-h1` (4 warnings). The link to `/unknown` has no page row and is ignored. Descriptions differ and both HTML pages have a canonical, so there are no notices.

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement loader**

```ts
import { gunzipSync } from 'node:zlib';

import type { PrismaClient } from '@wintel/database';

import { AUDIT_BATCH_SIZE } from './audit.constants';
import { type AuditContext, type AuditLink, type AuditPage, buildAuditContext } from './audit-context';
import { type PageFacts, extractPageFacts } from './page-facts';

export const AUDIT_CONTEXT_LOADER = Symbol('AUDIT_CONTEXT_LOADER');
export type AuditContextLoaderFn = (
  client: PrismaClient,
  scanId: string,
) => Promise<{ context: AuditContext; unreadableContent: number }>;

function isHtmlSuccess(statusCode: number | null, contentType: string | null): boolean {
  return (
    statusCode !== null &&
    statusCode >= 200 &&
    statusCode < 300 &&
    (contentType?.toLowerCase().includes('text/html') ?? false)
  );
}

/**
 * Builds the audit context a batch of pages at a time. Each batch's HTML is decompressed, reduced to
 * facts, and released before the next batch loads, so memory tracks the facts, not the markup.
 */
export async function loadAuditContext(
  client: PrismaClient,
  scanId: string,
): Promise<{ context: AuditContext; unreadableContent: number }> {
  const pages: AuditPage[] = [];
  const facts = new Map<string, PageFacts>();
  const links = new Map<string, AuditLink[]>();
  let unreadableContent = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await client.page.findMany({
      where: { scanId },
      orderBy: { id: 'asc' },
      take: AUDIT_BATCH_SIZE,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      include: { content: true, links: { select: { url: true, internal: true } } },
    });
    if (batch.length === 0) {
      break;
    }

    for (const row of batch) {
      pages.push({
        id: row.id,
        url: row.url,
        path: row.path,
        statusCode: row.statusCode,
        contentType: row.contentType,
        byteSize: row.byteSize,
        responseTimeMs: row.responseTimeMs,
        redirectedTo: row.redirectedTo,
        error: row.error,
      });
      links.set(row.id, row.links);

      if (row.content && isHtmlSuccess(row.statusCode, row.contentType)) {
        try {
          facts.set(row.id, extractPageFacts(gunzipSync(row.content.html).toString('utf8')));
        } catch {
          unreadableContent++;
        }
      }
    }
    cursor = batch[batch.length - 1]!.id;
  }

  return { context: buildAuditContext(pages, facts, links), unreadableContent };
}
```

- [ ] **Step 4: Implement worker producer**

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE, type ScanAuditJob } from '@wintel/types';
import { Queue } from 'bullmq';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Lets the crawl processor hand a finished scan to the auditor. Creating the audit row and adding
 * the job are separate steps so the row can exist before the scan is marked completed.
 */
@Injectable()
export class ScanAuditQueueService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SCAN_AUDIT_QUEUE) private readonly queue: Queue<ScanAuditJob>,
  ) {}

  createQueuedAudit(scanId: string, organizationId: string) {
    return this.prisma.client.audit.upsert({
      where: { scanId },
      create: { scanId, organizationId },
      update: {
        status: 'queued',
        criticalCount: 0,
        warningCount: 0,
        noticeCount: 0,
        startedAt: null,
        finishedAt: null,
        error: null,
      },
      select: { id: true, scanId: true },
    });
  }

  async enqueue(audit: { id: string; scanId: string }): Promise<void> {
    await this.queue.add('audit', { auditId: audit.id, scanId: audit.scanId }, { attempts: 1 });
  }
}
```

- [ ] **Step 5: Implement processor**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Prisma } from '@wintel/database';
import { SCAN_AUDIT_QUEUE, scanAuditJobSchema } from '@wintel/types';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ISSUE_INSERT_BATCH } from './audit.constants';
import { AUDIT_CONTEXT_LOADER, type AuditContextLoaderFn } from './audit-context-loader';
import { runAudit } from './run-audit';

const REPLACE_TIMEOUT_MS = 60_000;

/**
 * Owns an audit's lifecycle. Claims `queued → running` conditionally (a re-delivered job is
 * skipped), builds the context, runs the rules, and swaps the issue set in one transaction so a
 * failure never leaves an audit half-replaced. Failures mark the audit `failed` and rethrow.
 */
@Processor(SCAN_AUDIT_QUEUE)
export class ScanAuditProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUDIT_CONTEXT_LOADER) private readonly loadContext: AuditContextLoaderFn,
    @InjectPinoLogger(ScanAuditProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const data = scanAuditJobSchema.parse(job.data);
    const client = this.prisma.client;

    const { count } = await client.audit.updateMany({
      where: { id: data.auditId, status: 'queued' },
      data: { status: 'running', startedAt: new Date(), finishedAt: null, error: null },
    });
    if (count === 0) {
      this.logger.warn({ auditId: data.auditId }, 'Skipping audit job for an audit that is not queued');
      return;
    }

    try {
      const { context, unreadableContent } = await this.loadContext(client, data.scanId);
      if (unreadableContent > 0) {
        this.logger.warn({ auditId: data.auditId, unreadableContent }, 'Skipped unreadable page content');
      }
      const { issues, counts } = runAudit(context);

      await client.$transaction(
        async (tx) => {
          await tx.issue.deleteMany({ where: { auditId: data.auditId } });
          for (let start = 0; start < issues.length; start += ISSUE_INSERT_BATCH) {
            await tx.issue.createMany({
              data: issues.slice(start, start + ISSUE_INSERT_BATCH).map((issue) => ({
                auditId: data.auditId,
                pageId: issue.pageId,
                ruleId: issue.ruleId,
                severity: issue.severity,
                message: issue.message,
                evidence: issue.evidence as Prisma.InputJsonObject,
              })),
            });
          }
          await tx.audit.update({
            where: { id: data.auditId },
            data: {
              status: 'completed',
              finishedAt: new Date(),
              criticalCount: counts.critical,
              warningCount: counts.warning,
              noticeCount: counts.notice,
            },
          });
        },
        { timeout: REPLACE_TIMEOUT_MS },
      );

      this.logger.info({ auditId: data.auditId, ...counts }, 'Audit completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await client.audit.update({
        where: { id: data.auditId },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      });
      this.logger.error({ auditId: data.auditId, err: error }, 'Audit failed');
      throw error;
    }
  }
}
```

- [ ] **Step 6: Module**

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE } from '@wintel/types';

import { AUDIT_CONTEXT_LOADER, loadAuditContext } from './audit-context-loader';
import { ScanAuditQueueService } from './scan-audit-queue.service';
import { ScanAuditProcessor } from './scan-audit.processor';

/** Consumes audit jobs, and exports the producer the crawl module uses to start them. */
@Module({
  imports: [BullModule.registerQueue({ name: SCAN_AUDIT_QUEUE })],
  providers: [
    ScanAuditProcessor,
    ScanAuditQueueService,
    { provide: AUDIT_CONTEXT_LOADER, useValue: loadAuditContext },
  ],
  exports: [ScanAuditQueueService],
})
export class ScanAuditModule {}
```

- [ ] **Step 7: Run processor test — pass.**

- [ ] **Step 8: Crawl hook — tests first**

In `website-crawl.processor.test.ts`: add a module-level `const auditQueue = { createQueuedAudit: vi.fn(), enqueue: vi.fn() };`, reset them in a `beforeEach` to `createQueuedAudit.mockImplementation((scanId) => Promise.resolve({ id: 'audit-1', scanId }))` and `enqueue.mockResolvedValue(undefined)`, change the helper to `new WebsiteCrawlProcessor({ client: prisma } as never, factory, auditQueue as never, logger as never)`, and add:

```ts
  it('creates the audit before completing the scan, then enqueues it', async () => {
    const { scanId, organizationId, job } = await seedScan();
    auditQueue.createQueuedAudit.mockImplementation(async (id: string) => {
      const scan = await prisma.scan.findUniqueOrThrow({ where: { id } });
      expect(scan.status).toBe('running');
      return { id: 'audit-1', scanId: id };
    });

    await processor().process(job);

    expect(auditQueue.createQueuedAudit).toHaveBeenCalledWith(scanId, organizationId);
    expect(auditQueue.enqueue).toHaveBeenCalledWith({ id: 'audit-1', scanId });
  });

  it('keeps the scan completed when enqueueing the audit fails', async () => {
    const { scanId, job } = await seedScan();
    auditQueue.enqueue.mockRejectedValue(new Error('redis down'));

    await processor().process(job);

    expect((await prisma.scan.findUniqueOrThrow({ where: { id: scanId } })).status).toBe('completed');
  });

  it('does not create an audit for a failed crawl', async () => {
    const { job } = await seedScan();
    const failing = () => ({ run: () => Promise.reject(new Error('root down')) });

    await expect(processor(failing).process(job)).rejects.toThrow();

    expect(auditQueue.createQueuedAudit).not.toHaveBeenCalled();
  });
```

Run — the three new tests fail (constructor arity / no calls).

- [ ] **Step 9: Crawl hook — implementation**

In `website-crawl.processor.ts`: import `ScanAuditQueueService` (value import) from `'../scan-audit/scan-audit-queue.service'`; add constructor param `private readonly auditQueue: ScanAuditQueueService,` between `createRunner` and `logger`; replace the success block after `await writer.flush();` with:

```ts
      const audit = await this.auditQueue.createQueuedAudit(data.scanId, data.organizationId);
      await scans.update({
        where: { id: data.scanId },
        data: {
          status: 'completed',
          stopReason: result.stopReason,
          finishedAt: new Date(),
          pagesCrawled: result.pagesCrawled,
          pagesFailed: result.pagesFailed,
        },
      });
      await writer.pruneOlderContent(data.websiteId);
      this.logger.info({ scanId: data.scanId, ...result }, 'Crawl completed');

      try {
        await this.auditQueue.enqueue(audit);
      } catch (enqueueError) {
        this.logger.error(
          { scanId: data.scanId, auditId: audit.id, err: enqueueError },
          'Could not enqueue the audit of a completed scan',
        );
      }
```

Update the class doc comment's last sentence to mention: "On success it creates the scan's audit before marking the scan completed, then enqueues it."

In `website-crawl.module.ts` add `ScanAuditModule` to `imports`. In `worker.module.ts` import `ScanAuditModule` and place it after `WebsiteCrawlModule`.

- [ ] **Step 10: Worker suite + gates** (`vitest run`, `typecheck`, `lint`, `build`) — green. Verify DI imports in both processors after commit.

- [ ] **Step 11: Commit** — `feat(worker): audit completed scans and store issues`.

---

### Task 5: Audits API

**Files:**
- Create under `apps/api/src/modules/audits/`: `audits.repository.ts`, `audits.repository.test.ts`, `scan-audit-queue.service.ts`, `audits.service.ts`, `audits.service.test.ts`, `audits.controller.ts`, `audits.module.ts`
- Modify: `apps/api/src/modules/scans/scans.module.ts` (export `ScansService`), `apps/api/src/app.module.ts`, `apps/api/test/api.e2e.test.ts`

**Interfaces:**
- Consumes: `ScansService.getOrThrow(id, organizationId)`; contracts from Task 2.
- Produces: `AuditsRepository` — `findByScan(scanId, organizationId)`, `ruleCounts(auditId): Promise<RuleCount[]>`, `listIssues(auditId, filters: { severity?; ruleId? }, limit, offset): Promise<{ items; total }>`, `latestCompletedScanId(websiteId, organizationId): Promise<string | null>`, `requeue(scanId, organizationId)`. `ScanAuditQueueService.enqueue(job: ScanAuditJob)`. `AuditsService` — `getForScan`, `listIssues`, `rerun(scanId, organizationId, now?)`. Routes `GET/POST /scans/:id/audit`, `GET /scans/:id/issues`, `GET /audit-rules`.

- [ ] **Step 1: Failing repository test**

```ts
import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditsRepository } from './audits.repository';

let prisma: PrismaClient;
let repo: AuditsRepository;

async function seed() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({ data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true } });
  await prisma.organization.create({ data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` } });
  const website = await prisma.website.create({
    data: { organizationId, createdById: userId, name: 'S', url: 'https://s.test', domain: `s-${randomUUID().slice(0, 8)}.test`, verificationToken: 't' },
  });
  const older = await prisma.scan.create({
    data: { websiteId: website.id, organizationId, status: 'completed', createdAt: new Date(Date.now() - 60_000) },
  });
  const scan = await prisma.scan.create({ data: { websiteId: website.id, organizationId, status: 'completed' } });
  await prisma.scan.create({ data: { websiteId: website.id, organizationId, status: 'running' } });
  const pageA = await prisma.page.create({ data: { scanId: scan.id, url: 'https://s.test/b', path: '/b', depth: 1 } });
  const pageB = await prisma.page.create({ data: { scanId: scan.id, url: 'https://s.test/a', path: '/a', depth: 1 } });
  const audit = await prisma.audit.create({ data: { scanId: scan.id, organizationId, status: 'completed' } });
  await prisma.issue.createMany({
    data: [
      { auditId: audit.id, pageId: pageA.id, ruleId: 'missing-h1', severity: 'warning', message: 'm' },
      { auditId: audit.id, pageId: pageB.id, ruleId: 'missing-h1', severity: 'warning', message: 'm' },
      { auditId: audit.id, pageId: pageA.id, ruleId: 'server-error', severity: 'critical', message: 'm' },
    ],
  });
  return { organizationId, websiteId: website.id, olderScanId: older.id, scanId: scan.id, audit };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new AuditsRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AuditsRepository', () => {
  it('scopes audits to the organization', async () => {
    const a = await seed();
    const b = await seed();

    expect(await repo.findByScan(a.scanId, b.organizationId)).toBeNull();
    expect((await repo.findByScan(a.scanId, a.organizationId))?.id).toBe(a.audit.id);
  });

  it('counts issues per rule', async () => {
    const { audit } = await seed();

    expect(await repo.ruleCounts(audit.id)).toEqual(
      expect.arrayContaining([
        { ruleId: 'missing-h1', severity: 'warning', count: 2 },
        { ruleId: 'server-error', severity: 'critical', count: 1 },
      ]),
    );
  });

  it('lists issues critical first, then by rule and path, with filters and page info', async () => {
    const { audit } = await seed();

    const all = await repo.listIssues(audit.id, {}, 10, 0);
    expect(all.total).toBe(3);
    expect(all.items.map((issue) => `${issue.ruleId}${issue.page.path}`)).toEqual([
      'server-error/b',
      'missing-h1/a',
      'missing-h1/b',
    ]);

    const filtered = await repo.listIssues(audit.id, { ruleId: 'missing-h1' }, 1, 1);
    expect(filtered.total).toBe(2);
    expect(filtered.items.map((issue) => issue.page.path)).toEqual(['/b']);
  });

  it('finds the newest completed scan of a website', async () => {
    const { websiteId, organizationId, scanId } = await seed();

    expect(await repo.latestCompletedScanId(websiteId, organizationId)).toBe(scanId);
  });

  it('requeues an audit, resetting its state', async () => {
    const { scanId, organizationId, audit } = await seed();
    await prisma.audit.update({ where: { id: audit.id }, data: { criticalCount: 4, error: 'x' } });

    const requeued = await repo.requeue(scanId, organizationId);

    expect(requeued).toMatchObject({ id: audit.id, status: 'queued', criticalCount: 0, error: null });
  });
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement repository**

```ts
import { Injectable } from '@nestjs/common';
import type { AuditRuleId, IssueSeverity, RuleCount } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Audit and issue access for the API. Audits carry `organizationId`, which every audit lookup
 * filters on; issues are only ever read through an audit that already passed that filter.
 */
@Injectable()
export class AuditsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByScan(scanId: string, organizationId: string) {
    return this.prisma.client.audit.findFirst({ where: { scanId, organizationId } });
  }

  async ruleCounts(auditId: string): Promise<RuleCount[]> {
    const groups = await this.prisma.client.issue.groupBy({
      by: ['ruleId', 'severity'],
      where: { auditId },
      _count: { _all: true },
    });
    return groups.map((group) => ({
      ruleId: group.ruleId as AuditRuleId,
      severity: group.severity,
      count: group._count._all,
    }));
  }

  async listIssues(
    auditId: string,
    filters: { severity?: IssueSeverity; ruleId?: AuditRuleId },
    limit: number,
    offset: number,
  ) {
    const where = { auditId, ...filters };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.issue.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { ruleId: 'desc' }, { page: { path: 'asc' } }],
        include: { page: { select: { url: true, path: true } } },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.issue.count({ where }),
    ]);
    return { items, total };
  }

  async latestCompletedScanId(websiteId: string, organizationId: string): Promise<string | null> {
    const scan = await this.prisma.client.scan.findFirst({
      where: { websiteId, organizationId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return scan?.id ?? null;
  }

  requeue(scanId: string, organizationId: string) {
    return this.prisma.client.audit.upsert({
      where: { scanId },
      create: { scanId, organizationId },
      update: {
        status: 'queued',
        criticalCount: 0,
        warningCount: 0,
        noticeCount: 0,
        startedAt: null,
        finishedAt: null,
        error: null,
      },
    });
  }
}
```

> Ordering note: `ruleId: 'desc'` makes `server-error` sort before `missing-h1` only incidentally; the real grouping key for the UI is `ruleId` filtering. Keep the test's expectation (critical first comes from `severity`; within `warning`, `/a` before `/b` from path). If a future rule pair breaks the test's order assumption, sort within severity by `ruleId: 'asc'` and update the expectation — within one severity the test only has one rule, so either direction passes.

- [ ] **Step 4: Run repository test — pass.**

- [ ] **Step 5: Producer + service tests first**

`scan-audit-queue.service.ts` (api):

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE, type ScanAuditJob } from '@wintel/types';
import { Queue } from 'bullmq';

/** Producer for admin-initiated audit re-runs. Single attempt: a re-run can simply be re-run. */
@Injectable()
export class ScanAuditQueueService {
  constructor(@InjectQueue(SCAN_AUDIT_QUEUE) private readonly queue: Queue<ScanAuditJob>) {}

  async enqueue(job: ScanAuditJob): Promise<void> {
    await this.queue.add('audit', job, { attempts: 1 });
  }
}
```

`audits.service.test.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AUDIT_STALE_MS } from '@wintel/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditsService } from './audits.service';

const now = new Date('2026-09-17T12:00:00.000Z');
const scan = { id: 's1', websiteId: 'w1', status: 'completed' };

describe('AuditsService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let scans: { getOrThrow: ReturnType<typeof vi.fn> };
  let queue: { enqueue: ReturnType<typeof vi.fn> };
  let service: AuditsService;

  beforeEach(() => {
    repo = {
      findByScan: vi.fn().mockResolvedValue(null),
      ruleCounts: vi.fn().mockResolvedValue([]),
      listIssues: vi.fn(),
      latestCompletedScanId: vi.fn().mockResolvedValue('s1'),
      requeue: vi.fn().mockResolvedValue({ id: 'a1', scanId: 's1', status: 'queued' }),
    };
    scans = { getOrThrow: vi.fn().mockResolvedValue(scan) };
    queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    service = new AuditsService(repo as never, scans as never, queue as never);
  });

  const codeOf = async (promise: Promise<unknown>) => {
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    return ((error as ConflictException).getResponse() as { details: { code: string } }).details.code;
  };

  it('returns the audit with rule counts', async () => {
    repo.findByScan!.mockResolvedValue({ id: 'a1' });
    repo.ruleCounts!.mockResolvedValue([{ ruleId: 'missing-h1', severity: 'warning', count: 2 }]);

    expect(await service.getForScan('s1', 'o1')).toEqual({
      id: 'a1',
      ruleCounts: [{ ruleId: 'missing-h1', severity: 'warning', count: 2 }],
    });
  });

  it('404s a scan without an audit', async () => {
    await expect(service.getForScan('s1', 'o1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists issues with pagination echoed', async () => {
    repo.findByScan!.mockResolvedValue({ id: 'a1' });
    repo.listIssues!.mockResolvedValue({ items: [], total: 0 });

    const result = await service.listIssues('s1', 'o1', { ruleId: 'missing-h1', limit: 10, offset: 5 });

    expect(repo.listIssues).toHaveBeenCalledWith('a1', { ruleId: 'missing-h1' }, 10, 5);
    expect(result).toEqual({ items: [], total: 0, limit: 10, offset: 5 });
  });

  it('re-runs the audit of the latest completed scan', async () => {
    const audit = await service.rerun('s1', 'o1', now);

    expect(repo.requeue).toHaveBeenCalledWith('s1', 'o1');
    expect(queue.enqueue).toHaveBeenCalledWith({ auditId: 'a1', scanId: 's1' });
    expect(audit).toMatchObject({ id: 'a1', ruleCounts: [] });
  });

  it('refuses a scan that has not completed', async () => {
    scans.getOrThrow.mockResolvedValue({ ...scan, status: 'running' });

    expect(await codeOf(service.rerun('s1', 'o1', now))).toBe('SCAN_NOT_COMPLETED');
  });

  it('refuses an older scan whose content was pruned', async () => {
    repo.latestCompletedScanId!.mockResolvedValue('s2');

    expect(await codeOf(service.rerun('s1', 'o1', now))).toBe('AUDIT_CONTENT_UNAVAILABLE');
  });

  it('refuses while an audit is in progress, but not once it is stale', async () => {
    repo.findByScan!.mockResolvedValue({ id: 'a1', status: 'running', updatedAt: new Date(now.getTime() - 1000) });
    expect(await codeOf(service.rerun('s1', 'o1', now))).toBe('AUDIT_IN_PROGRESS');

    repo.findByScan!.mockResolvedValue({ id: 'a1', status: 'queued', updatedAt: new Date(now.getTime() - AUDIT_STALE_MS - 1) });
    await expect(service.rerun('s1', 'o1', now)).resolves.toMatchObject({ id: 'a1' });
  });
});
```

- [ ] **Step 6: Implement service**

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVE_AUDIT_STATUSES, AUDIT_STALE_MS, type IssueListQuery } from '@wintel/types';

import { ScansService } from '../scans/scans.service';
import { AuditsRepository } from './audits.repository';
import { ScanAuditQueueService } from './scan-audit-queue.service';

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ message, details: { code } });
}

/** Audit reads and re-run rules. Every entry point first proves the scan belongs to the caller's org. */
@Injectable()
export class AuditsService {
  constructor(
    private readonly repo: AuditsRepository,
    private readonly scans: ScansService,
    private readonly auditQueue: ScanAuditQueueService,
  ) {}

  private async auditOrThrow(scanId: string, organizationId: string) {
    await this.scans.getOrThrow(scanId, organizationId);
    const audit = await this.repo.findByScan(scanId, organizationId);
    if (!audit) {
      throw new NotFoundException('Audit not found');
    }
    return audit;
  }

  async getForScan(scanId: string, organizationId: string) {
    const audit = await this.auditOrThrow(scanId, organizationId);
    return { ...audit, ruleCounts: await this.repo.ruleCounts(audit.id) };
  }

  async listIssues(scanId: string, organizationId: string, query: IssueListQuery) {
    const audit = await this.auditOrThrow(scanId, organizationId);
    const { limit, offset, ...filters } = query;
    const result = await this.repo.listIssues(audit.id, filters, limit, offset);
    return { ...result, limit, offset };
  }

  async rerun(scanId: string, organizationId: string, now: Date = new Date()) {
    const scan = await this.scans.getOrThrow(scanId, organizationId);
    if (scan.status !== 'completed') {
      throw conflict('SCAN_NOT_COMPLETED', 'Only a completed scan can be audited');
    }
    if ((await this.repo.latestCompletedScanId(scan.websiteId, organizationId)) !== scan.id) {
      throw conflict(
        'AUDIT_CONTENT_UNAVAILABLE',
        "Only the website's latest completed scan keeps the page content an audit needs",
      );
    }

    const existing = await this.repo.findByScan(scanId, organizationId);
    const active =
      existing !== null &&
      (ACTIVE_AUDIT_STATUSES as readonly string[]).includes(existing.status) &&
      now.getTime() - existing.updatedAt.getTime() < AUDIT_STALE_MS;
    if (active) {
      throw conflict('AUDIT_IN_PROGRESS', 'This scan is already being audited');
    }

    const audit = await this.repo.requeue(scanId, organizationId);
    await this.auditQueue.enqueue({ auditId: audit.id, scanId });
    return { ...audit, ruleCounts: [] };
  }
}
```

- [ ] **Step 7: Controller + module + wiring**

`audits.controller.ts`:

```ts
import { Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AUDIT_RULES,
  type AuditRule,
  type AuditRuleId,
  type IssueListQuery,
  type Principal,
  issueListQuerySchema,
} from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { AuditsService } from './audits.service';

/** Audits of the caller's scans. Members read; admins and owners re-run. */
@Controller()
@UseGuards(SessionGuard, RolesGuard)
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Get('audit-rules')
  rules(): AuditRule[] {
    return (Object.keys(AUDIT_RULES) as AuditRuleId[]).map((id) => ({ id, ...AUDIT_RULES[id] }));
  }

  @Get('scans/:id/audit')
  get(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.audits.getForScan(id, this.orgId(principal));
  }

  @Post('scans/:id/audit')
  @Roles('admin')
  @HttpCode(202)
  rerun(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.audits.rerun(id, this.orgId(principal));
  }

  @Get('scans/:id/issues')
  issues(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(issueListQuerySchema)) query: IssueListQuery,
  ) {
    return this.audits.listIssues(id, this.orgId(principal), query);
  }
}
```

`audits.module.ts`:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE } from '@wintel/types';

import { ScansModule } from '../scans/scans.module';
import { AuditsController } from './audits.controller';
import { AuditsRepository } from './audits.repository';
import { AuditsService } from './audits.service';
import { ScanAuditQueueService } from './scan-audit-queue.service';

@Module({
  imports: [ScansModule, BullModule.registerQueue({ name: SCAN_AUDIT_QUEUE })],
  controllers: [AuditsController],
  providers: [AuditsService, AuditsRepository, ScanAuditQueueService],
})
export class AuditsModule {}
```

Add `exports: [ScansService],` to `ScansModule`. Register `AuditsModule` after `ScansModule` in `app.module.ts`.

- [ ] **Step 8: E2E** — in `api.e2e.test.ts` import `SCAN_AUDIT_QUEUE`; in the `scans` describe add `let scanId: string;`, set `scanId = first.body.id;` in the "starts a scan" test, obliterate the audit queue in `afterAll` too, and append:

```ts
  it('serves the audit rule catalog to members', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/audit-rules').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(15);
  });

  it('rejects an unauthenticated audit read with 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/audit-rules');

    expect(response.status).toBe(401);
  });

  it('404s the audit of a scan that has none', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/scans/${scanId}/audit`).set('Cookie', cookie);

    expect(response.status).toBe(404);
  });

  it('refuses to re-run the audit of a scan that has not completed', async () => {
    const response = await request(app.getHttpServer()).post(`/api/v1/scans/${scanId}/audit`).set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.details).toEqual({ code: 'SCAN_NOT_COMPLETED' });
  });
```

- [ ] **Step 9: API suite + gates** — green. Verify DI value imports.

- [ ] **Step 10: Commit** — `feat(api): expose audits, issues, rule catalog and re-runs`.

---

### Task 6: Web audit section

**Files:**
- Create: `apps/web/src/lib/audits-client.ts`, `audits-client.test.ts`, `use-audits.ts`
- Create: `apps/web/src/components/audit-section.tsx`, `audit-section.test.tsx`, `audit-rule-group.tsx`
- Modify: `apps/web/src/components/scan-panel.tsx`, `scan-panel.test.tsx`

**Interfaces:**
- Produces: `getAudit(scanId): Promise<Audit | null>` (404 → null), `listIssues(scanId, { ruleId, limit, offset }): Promise<IssueList>`, `rerunAudit(scanId): Promise<Audit>`; hooks `useAudit(scanId)` (key `['scans', scanId, 'audit']`, polls 2 s while active), `useRerunAudit(scanId)`, `useRuleIssues(scanId, ruleId, offset, auditUpdatedAt, enabled)`; `isActiveAudit(audit)`; `ISSUE_PAGE_SIZE = 20`; `<AuditSection scanId />`, `<AuditRuleGroup scanId ruleId count auditUpdatedAt />`.

- [ ] **Step 1: Failing client test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAudit, listIssues } from './audits-client';

afterEach(() => vi.unstubAllGlobals());

describe('audits-client', () => {
  it('returns null when the scan has no audit yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))));

    expect(await getAudit('s1')).toBeNull();
  });

  it('throws on other failures', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))));

    await expect(getAudit('s1')).rejects.toMatchObject({ status: 500 });
  });

  it('filters issues by rule with pagination', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 40 }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listIssues('s1', { ruleId: 'missing-h1', limit: 20, offset: 40 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/scans\/s1\/issues\?ruleId=missing-h1&limit=20&offset=40$/),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement client + hooks**

`audits-client.ts`:

```ts
import {
  type Audit,
  type AuditRuleId,
  type IssueList,
  auditSchema,
  issueListSchema,
} from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(`Audit request failed (${response.status})`, response.status);
  }

  return response;
}

/** The scan's audit, or null when none exists yet. */
export async function getAudit(scanId: string): Promise<Audit | null> {
  try {
    const response = await request(`/scans/${scanId}/audit`);

    return auditSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function rerunAudit(scanId: string): Promise<Audit> {
  const response = await request(`/scans/${scanId}/audit`, { method: 'POST' });

  return auditSchema.parse(await response.json());
}

export async function listIssues(
  scanId: string,
  query: { ruleId: AuditRuleId; limit: number; offset: number },
): Promise<IssueList> {
  const response = await request(
    `/scans/${scanId}/issues?ruleId=${query.ruleId}&limit=${query.limit}&offset=${query.offset}`,
  );

  return issueListSchema.parse(await response.json());
}
```

`use-audits.ts`:

```ts
'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_AUDIT_STATUSES, type Audit, type AuditRuleId } from '@wintel/types';

import { getAudit, listIssues, rerunAudit } from './audits-client';

export const AUDIT_POLL_INTERVAL_MS = 2_000;
export const ISSUE_PAGE_SIZE = 20;

export function isActiveAudit(audit: Audit | null | undefined): boolean {
  return (
    audit !== null &&
    audit !== undefined &&
    (ACTIVE_AUDIT_STATUSES as readonly string[]).includes(audit.status)
  );
}

function auditKey(scanId: string) {
  return ['scans', scanId, 'audit'] as const;
}

export function useAudit(scanId: string) {
  return useQuery({
    queryKey: auditKey(scanId),
    queryFn: () => getAudit(scanId),
    refetchInterval: (query) => (isActiveAudit(query.state.data) ? AUDIT_POLL_INTERVAL_MS : false),
  });
}

export function useRerunAudit(scanId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => rerunAudit(scanId),
    onSuccess: () => client.invalidateQueries({ queryKey: auditKey(scanId) }),
  });
}

/** Affected pages for one rule. Keyed on the audit's `updatedAt` so a re-run shows fresh rows. */
export function useRuleIssues(
  scanId: string,
  ruleId: AuditRuleId,
  offset: number,
  auditUpdatedAt: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['scans', scanId, 'issues', ruleId, offset, auditUpdatedAt],
    queryFn: () => listIssues(scanId, { ruleId, limit: ISSUE_PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
```

- [ ] **Step 4: Run client test — pass.**

- [ ] **Step 5: Failing audit-section test**

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Audit } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rerunMutate = vi.fn();
let audit: Audit | null = null;

vi.mock('@/lib/use-audits', () => ({
  ISSUE_PAGE_SIZE: 20,
  isActiveAudit: (value: Audit | null) => value?.status === 'queued' || value?.status === 'running',
  useAudit: () => ({ data: audit, isPending: false, isError: false }),
  useRerunAudit: () => ({ mutate: rerunMutate, isPending: false, error: null }),
  useRuleIssues: () => ({ data: undefined, isPending: true, isError: false }),
}));

import { AuditSection } from './audit-section';

function makeAudit(overrides: Partial<Audit>): Audit {
  return {
    id: 'a1',
    scanId: 's1',
    organizationId: 'o1',
    status: 'completed',
    criticalCount: 1,
    warningCount: 3,
    noticeCount: 0,
    startedAt: '2026-09-17T00:00:00.000Z',
    finishedAt: '2026-09-17T00:00:01.000Z',
    error: null,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:01.000Z',
    ruleCounts: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  rerunMutate.mockReset();
  audit = null;
});

describe('AuditSection', () => {
  it('offers to run an audit when none exists', () => {
    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('No audit yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run audit' }));
    expect(rerunMutate).toHaveBeenCalled();
  });

  it('shows progress while auditing', () => {
    audit = makeAudit({ status: 'running' });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByRole('button', { name: 'Auditing…' })).toBeDisabled();
  });

  it('shows severity counts and rules grouped most severe first', () => {
    audit = makeAudit({
      ruleCounts: [
        { ruleId: 'missing-h1', severity: 'warning', count: 2 },
        { ruleId: 'broken-internal-link', severity: 'critical', count: 1 },
        { ruleId: 'client-error', severity: 'warning', count: 1 },
      ],
    });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('1 critical · 3 warnings · 0 notices')).toBeInTheDocument();
    const titles = screen.getAllByTestId('audit-rule-title').map((element) => element.textContent);
    expect(titles).toEqual(['Broken internal link', 'Missing H1', 'Page not found or forbidden']);
    expect(screen.getByRole('button', { name: 'Re-run audit' })).toBeEnabled();
  });

  it('says so when a completed audit found nothing', () => {
    audit = makeAudit({ criticalCount: 0, warningCount: 0 });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('No issues found.')).toBeInTheDocument();
  });

  it('shows why an audit failed', () => {
    audit = makeAudit({ status: 'failed', error: 'loader exploded' });

    render(<AuditSection scanId="s1" />);

    expect(screen.getByText('loader exploded')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run — fail.**

- [ ] **Step 7: Implement components**

`audit-rule-group.tsx`:

```tsx
'use client';

import { AUDIT_RULES, type AuditRuleId, type IssueSeverity } from '@wintel/types';
import { Badge, Button } from '@wintel/ui';
import { useState } from 'react';

import { ISSUE_PAGE_SIZE, useRuleIssues } from '@/lib/use-audits';

export const SEVERITY_VARIANT: Record<IssueSeverity, 'destructive' | 'default' | 'outline'> = {
  critical: 'destructive',
  warning: 'default',
  notice: 'outline',
};

/** One rule's findings: a summary row that expands into the affected pages. */
export function AuditRuleGroup({
  scanId,
  ruleId,
  count,
  auditUpdatedAt,
}: {
  scanId: string;
  ruleId: AuditRuleId;
  count: number;
  auditUpdatedAt: string;
}) {
  const rule = AUDIT_RULES[ruleId];
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const issues = useRuleIssues(scanId, ruleId, offset, auditUpdatedAt, open);

  return (
    <details
      className="rounded-md border border-border"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <Badge variant={SEVERITY_VARIANT[rule.severity]}>{rule.severity}</Badge>
          <span data-testid="audit-rule-title">{rule.title}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? 'page' : 'pages'}
        </span>
      </summary>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">{rule.description}</p>
          {issues.isPending ? (
            <p className="text-xs text-muted-foreground">Loading pages…</p>
          ) : issues.isError ? (
            <p className="text-xs text-destructive">Could not load pages.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {issues.data.items.map((issue) => (
                  <li key={issue.id} className="text-xs">
                    <span className="font-medium" title={issue.page.url}>
                      {issue.page.path}
                    </span>{' '}
                    <span className="text-muted-foreground">{issue.message}</span>
                  </li>
                ))}
              </ul>
              {issues.data.total > ISSUE_PAGE_SIZE ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - ISSUE_PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + ISSUE_PAGE_SIZE >= issues.data.total}
                    onClick={() => setOffset(offset + ISSUE_PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}
```

`audit-section.tsx`:

```tsx
'use client';

import { AUDIT_RULES, type AuditStatus, ISSUE_SEVERITIES } from '@wintel/types';
import { Badge, Button } from '@wintel/ui';

import { AuditRuleGroup } from '@/components/audit-rule-group';
import { isActiveAudit, useAudit, useRerunAudit } from '@/lib/use-audits';

const STATUS_VARIANT: Record<AuditStatus, 'default' | 'success' | 'destructive' | 'outline'> = {
  queued: 'outline',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The audit of one completed scan: status, severity counts, and issues grouped by rule. */
export function AuditSection({ scanId }: { scanId: string }) {
  const { data: audit, isPending, isError } = useAudit(scanId);
  const rerun = useRerunAudit(scanId);
  const active = isActiveAudit(audit);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading audit…</p>;
  }

  if (isError) {
    return <p className="text-sm text-destructive">Could not load the audit.</p>;
  }

  const groups = [...(audit?.ruleCounts ?? [])].sort(
    (a, b) =>
      ISSUE_SEVERITIES.indexOf(a.severity) - ISSUE_SEVERITIES.indexOf(b.severity) ||
      b.count - a.count ||
      AUDIT_RULES[a.ruleId].title.localeCompare(AUDIT_RULES[b.ruleId].title),
  );
  const totalIssues = audit ? audit.criticalCount + audit.warningCount + audit.noticeCount : 0;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Audit</h3>
          {audit ? <Badge variant={STATUS_VARIANT[audit.status]}>{audit.status}</Badge> : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => rerun.mutate()}
          disabled={active || rerun.isPending}
        >
          {active ? 'Auditing…' : audit ? 'Re-run audit' : 'Run audit'}
        </Button>
      </div>

      {rerun.error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not start the audit.
        </p>
      ) : null}

      {audit === null ? <p className="text-sm text-muted-foreground">No audit yet.</p> : null}

      {audit?.status === 'failed' && audit.error !== null ? (
        <p className="text-xs text-destructive">{audit.error}</p>
      ) : null}

      {audit?.status === 'completed' ? (
        <>
          <p className="text-sm">
            {`${audit.criticalCount} critical · ${plural(audit.warningCount, 'warning')} · ${plural(audit.noticeCount, 'notice')}`}
          </p>
          {totalIssues === 0 ? (
            <p className="text-sm text-muted-foreground">No issues found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((group) => (
                <AuditRuleGroup
                  key={group.ruleId}
                  scanId={scanId}
                  ruleId={group.ruleId}
                  count={group.count}
                  auditUpdatedAt={audit.updatedAt}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8: Wire into the scan panel**

In `scan-panel.tsx` import `AuditSection` and render `{latest.status === 'completed' ? <AuditSection scanId={latest.id} /> : null}` directly after the status block (before `ScanPagesTable`). In `scan-panel.test.tsx` add, before importing `ScanPanel`:

```ts
vi.mock('@/components/audit-section', () => ({ AuditSection: () => null }));
```

- [ ] **Step 9: Web suite + gates** (`vitest run`, `typecheck`, `lint`, `build`) — green.

- [ ] **Step 10: Commit** — `feat(web): show audit results grouped by rule`.

---

### Task 7: Live verification, ledger, README, PR

- [ ] **Step 1: Full gates** — `pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`.

- [ ] **Step 2: Live audit** — a Node server in the scratchpad (`audit-site.mjs`, `node:http`, port 8081) serving:

| Path | Response |
|---|---|
| `/` | 200 HTML: title "Audit home page", description "Home", canonical, one H1; links `/about`, `/dupe-a`, `/dupe-b`, `/missing`, `/slow`, `/hidden`, `/old` |
| `/about` | 200 HTML: title "About" (5 chars), no description, no canonical, no H1; links `/boom` |
| `/dupe-a`, `/dupe-b` | 200 HTML: title "Duplicate title page", description "Same description", canonical; `/dupe-a` one H1, `/dupe-b` two H1s |
| `/missing` | 404 |
| `/boom` | 500 |
| `/slow` | 200 HTML after a 2500 ms delay, complete tags |
| `/hidden` | 200 HTML with `<meta name="robots" content="noindex">`, complete tags |
| `/old` | 301 → `/about` |

Start `pnpm dev`, sign up/verify/sign in, create website `http://localhost:8081`, mark verified, start a scan, wait for scan `completed` and audit `completed`, then `GET /scans/:id/issues?limit=200`. Expected issues:
- critical: `broken-internal-link` on `/` → `/missing`; `broken-internal-link` on `/about` → `/boom`; `server-error` on `/boom`.
- warning: `client-error` on `/missing`; `duplicate-title` on `/dupe-a` and `/dupe-b`; `missing-meta-description`, `missing-h1` on `/about`; `slow-response` on `/slow`.
- notice: `redirected-link` on `/` → `/old`; `title-length` on `/about`; `duplicate-meta-description` on `/dupe-a`, `/dupe-b`; `multiple-h1` on `/dupe-b`; `missing-canonical` on `/about`; `noindex` on `/hidden`.

Then `POST /scans/:id/audit` → 202, poll to `completed`, confirm the same issue count (replaced, not doubled). Record counts.

- [ ] **Step 3: Stop the stack** — `pkill -f "turbo run dev"; pkill -f audit-site.mjs`.

- [ ] **Step 4: README + ledger** — README lists the audit engine; append slice-5 record to `.superpowers/sdd/progress.md`. Commit `docs: note audit engine in readme`.

- [ ] **Step 5: Push + PR** — `git push -u origin feat/audit-engine`; `gh pr create --base main` with summary, live results, footer.

- [ ] **Step 6: CI** — wait for checks to leave pending; report.

---

## Self-Review

- **Spec coverage:** automatic audit (Task 4 crawl hook); 15 rules with severities, mutual exclusions, unknown-link handling (Tasks 2, 3); counts (Tasks 3, 4); two-stage batched engine (Tasks 3, 4); one audit per scan, replace on re-run in one transaction (Task 4); re-run rules incl. stale and pruned-content 409s (Task 5); catalog endpoint (Task 5); audit created before scan completes (Task 4 test); web grouped issues + polling (Task 6); error table rows: unreadable content counted and logged (Task 4 loader/processor), failure keeps prior issues (Task 4 test), stalled re-delivery skipped (Task 4 test), enqueue failure keeps scan completed (Task 4 test); live verification (Task 7).
- **Placeholders:** none; the one inline correction in Task 4 Step 1 (seed descriptions) gives the exact replacement helper.
- **Type consistency:** `AuditContext`/`IssueDraft`/`AuditRuleImplementation` (Task 3) are what the loader returns and `runAudit` consumes (Task 4). `ScanAuditQueueService` (worker) exposes `createQueuedAudit`/`enqueue`, matching the crawl processor mocks. API `AuditsRepository` method names match the service mocks. `ruleCounts` shape matches `ruleCountSchema`, consumed by `AuditSection`. Query key `['scans', scanId, 'audit']` shared by `useAudit` and `useRerunAudit`.
