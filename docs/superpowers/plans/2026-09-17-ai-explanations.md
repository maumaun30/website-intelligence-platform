# AI Explanations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users request a Claude-written explanation and fix list for one rule in one audit, generated in the worker, stored once, capped per organization per day, and shown in the audit section.

**Architecture:** `Explanation` rows keyed by (audit, rule). The API validates, caps, and enqueues; the worker builds a grounded input from stored audit data, calls an `ExplanationGenerator` (Anthropic, local fake, or unconfigured), validates structured output, and stores content plus token usage. The web polls and renders.

**Tech Stack:** TypeScript, NestJS 11, Prisma 6, BullMQ, Zod 4, `@anthropic-ai/sdk` ^0.126.0 (worker only), cheerio, Next.js 15, TanStack Query 5, vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-ai-explanations-design.md`

## Global Constraints

- Prefix every shell command (including `git commit`) with `. ~/.nvm/nvm.sh && nvm use 22 >/dev/null`. After `pnpm --filter … add`, run a root `pnpm install`.
- Model call: `client.beta.messages.create` with `model: 'claude-opus-5'`, `max_tokens: 4000`, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, `thinking: { type: 'adaptive' }`, `output_config: { effort: 'low', format: { type: 'json_schema', schema } }`, system as one text block with `cache_control: { type: 'ephemeral' }`. Check `stop_reason === 'refusal'` before reading content; parse the `text` block with `JSON.parse`, validate with Zod.
- Limits: `AI_DAILY_LIMIT = 50`, `EXPLANATION_PAGE_LIMIT = 10`, `EXPLANATION_MAX_FIXES = 10`, `EXPLANATION_MAX_ADVICE = 5`; job `attempts: 2`, `backoff: { type: 'exponential', delay: 5000 }`.
- Env: API `AI_EXPLANATIONS_ENABLED` (`z.stringbool().default(false)`); worker `ANTHROPIC_API_KEY` (optional), `AI_EXPLANATION_PROVIDER` (`anthropic|fake`, default `anthropic`).
- Never send raw HTML to the model. Never log the API key.
- Error codes in `details.code`: `AI_UNAVAILABLE` (503), `AUDIT_NOT_COMPLETED` (409), `NO_ISSUES_FOR_RULE` (409), `AI_DAILY_LIMIT` (429). Regenerate as a member → 403.
- DI classes are value imports. Commits end with the two attribution lines:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SJ3KW2BdV6HozzjAbgPRqy
  ```

---

### Task 1: Explanation model + migration

- [ ] **Step 1:** Add `explanations Explanation[]` to `Audit` (after `changes IssueChange[]`) and append:

```prisma
enum ExplanationStatus {
  queued
  running
  completed
  failed
}

model Explanation {
  id              String            @id @default(uuid())
  auditId         String
  ruleId          String
  organizationId  String
  status          ExplanationStatus @default(queued)
  content         Json?
  model           String?
  inputTokens     Int?
  outputTokens    Int?
  cacheReadTokens Int?
  error           String?
  requestedById   String?
  requestedAt     DateTime          @default(now())
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  audit Audit @relation(fields: [auditId], references: [id], onDelete: Cascade)

  @@unique([auditId, ruleId])
  @@index([organizationId, requestedAt])
  @@map("explanation")
}
```

- [ ] **Step 2:** `db:migrate:dev --name add_explanations`, build database, typecheck api + worker.
- [ ] **Step 3:** Commit `feat(database): add ai explanations`.

---

### Task 2: Contracts + config

**Files:** Create `packages/types/src/explanations.ts`, `explanations.test.ts`; modify `packages/types/src/index.ts`; modify `packages/config/src/schemas.ts`, `schemas.test.ts`.

**Interfaces:** Produces the constants and schemas listed in Global Constraints and the spec; `ApiEnv.AI_EXPLANATIONS_ENABLED: boolean`; `WorkerEnv.ANTHROPIC_API_KEY?: string`, `WorkerEnv.AI_EXPLANATION_PROVIDER: 'anthropic' | 'fake'`.

- [ ] **Step 1: Failing tests**

`explanations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  explainIssueJobSchema,
  explanationContentSchema,
  requestExplanationInputSchema,
} from './explanations';

describe('explanationContentSchema', () => {
  it('accepts a complete explanation', () => {
    expect(
      explanationContentSchema.safeParse({
        summary: 's',
        whyItMatters: 'w',
        fixes: [{ path: '/about', action: 'Add a unique title' }],
        generalAdvice: ['Keep titles unique'],
      }).success,
    ).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(explanationContentSchema.safeParse({ summary: 's' }).success).toBe(false);
  });
});

describe('requestExplanationInputSchema', () => {
  it('defaults regenerate to false and rejects unknown rules', () => {
    expect(requestExplanationInputSchema.parse({ ruleId: 'missing-h1' })).toEqual({
      ruleId: 'missing-h1',
      regenerate: false,
    });
    expect(requestExplanationInputSchema.safeParse({ ruleId: 'nope' }).success).toBe(false);
  });
});

describe('explainIssueJobSchema', () => {
  it('requires the explanation id', () => {
    expect(explainIssueJobSchema.safeParse({}).success).toBe(false);
  });
});
```

Append to `packages/config/src/schemas.test.ts` (inside the file, as new describe blocks; import `apiEnvSchema`/`workerEnvSchema` if not already imported):

```ts
describe('AI settings', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('keeps AI explanations off unless enabled', () => {
    const api = apiEnvSchema.parse({ ...base, BETTER_AUTH_SECRET: 'x'.repeat(32) });
    expect(api.AI_EXPLANATIONS_ENABLED).toBe(false);
    expect(
      apiEnvSchema.parse({ ...base, BETTER_AUTH_SECRET: 'x'.repeat(32), AI_EXPLANATIONS_ENABLED: 'true' })
        .AI_EXPLANATIONS_ENABLED,
    ).toBe(true);
  });

  it('defaults the worker to the anthropic provider with no key', () => {
    const worker = workerEnvSchema.parse(base);
    expect(worker.AI_EXPLANATION_PROVIDER).toBe('anthropic');
    expect(worker.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run both suites — fail.

- [ ] **Step 3: Implement `explanations.ts`**

```ts
import { z } from 'zod';

import { AUDIT_RULE_IDS } from './audit';

export const EXPLANATION_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export const ACTIVE_EXPLANATION_STATUSES = ['queued', 'running'] as const;

export const AI_DAILY_LIMIT = 50;
export const EXPLANATION_PAGE_LIMIT = 10;
export const EXPLANATION_MAX_FIXES = 10;
export const EXPLANATION_MAX_ADVICE = 5;

export const EXPLAIN_ISSUE_QUEUE = 'explain-issue';

/** What the model returns, after validation. */
export const explanationContentSchema = z.object({
  summary: z.string(),
  whyItMatters: z.string(),
  fixes: z.array(z.object({ path: z.string(), action: z.string() })),
  generalAdvice: z.array(z.string()),
});

export const explanationSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  ruleId: z.enum(AUDIT_RULE_IDS),
  status: z.enum(EXPLANATION_STATUSES),
  content: explanationContentSchema.nullable(),
  model: z.string().nullable(),
  error: z.string().nullable(),
  requestedAt: z.string(),
  updatedAt: z.string(),
});

export const requestExplanationInputSchema = z.object({
  ruleId: z.enum(AUDIT_RULE_IDS),
  regenerate: z.boolean().default(false),
});

export const explainIssueJobSchema = z.object({ explanationId: z.string() });

export type ExplanationStatus = (typeof EXPLANATION_STATUSES)[number];
export type ExplanationContent = z.infer<typeof explanationContentSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
export type RequestExplanationInput = z.infer<typeof requestExplanationInputSchema>;
export type ExplainIssueJob = z.infer<typeof explainIssueJobSchema>;
```

Barrel — append:

```ts
export {
  ACTIVE_EXPLANATION_STATUSES,
  AI_DAILY_LIMIT,
  EXPLAIN_ISSUE_QUEUE,
  EXPLANATION_MAX_ADVICE,
  EXPLANATION_MAX_FIXES,
  EXPLANATION_PAGE_LIMIT,
  EXPLANATION_STATUSES,
  explainIssueJobSchema,
  explanationContentSchema,
  explanationSchema,
  requestExplanationInputSchema,
} from './explanations';
export type {
  ExplainIssueJob,
  Explanation,
  ExplanationContent,
  ExplanationStatus,
  RequestExplanationInput,
} from './explanations';
```

- [ ] **Step 4: Config.** In `schemas.ts` add:

```ts
/** AI explanations are off unless explicitly enabled; the API refuses requests while off. */
export const aiApiEnvSchema = z.object({
  AI_EXPLANATIONS_ENABLED: z.stringbool().default(false),
});

/**
 * The worker's model access. The key is optional so the platform runs without AI; `fake` returns
 * labeled deterministic text for local development and verification, and is never the default.
 */
export const aiWorkerEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_EXPLANATION_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),
});
```

Spread `...aiApiEnvSchema.shape` into `apiEnvSchema` and `...aiWorkerEnvSchema.shape` into `workerEnvSchema`. Add both variables, commented, to `.env.example`:

```
# AI explanations (optional). API gate; worker key and provider.
# AI_EXPLANATIONS_ENABLED=true
# ANTHROPIC_API_KEY=
# AI_EXPLANATION_PROVIDER=anthropic
```

- [ ] **Step 5:** Tests, typecheck, lint, build for `@wintel/types` and `@wintel/config` — green.
- [ ] **Step 6:** Commit `feat(types): add ai explanation contracts and settings`.

---

### Task 3: Worker — input, prompt, generators

**Files (under `apps/worker/src/queues/explain-issue/`):** `explanation-input.ts`, `explanation-input.test.ts`, `prompt.ts`, `prompt.test.ts`, `generator.ts`, `anthropic-generator.ts`, `anthropic-generator.test.ts`, `fake-generator.ts`, `fake-generator.test.ts`. Modify `apps/worker/package.json` (add `@anthropic-ai/sdk`).

**Interfaces:**
- `interface ExplanationPageInput { path: string; message: string; evidence: Record<string, unknown>; facts: PageFacts | null }`
- `interface ExplanationInput { domain: string; rule: { id: AuditRuleId; title: string; severity: IssueSeverity; description: string }; issueCount: number; affectedPageCount: number; pages: ExplanationPageInput[] }`
- `buildExplanationInput(client: PrismaClient, explanation: { auditId: string; ruleId: string }): Promise<ExplanationInput>`
- `EXPLANATION_SYSTEM_PROMPT: string`, `renderExplanationPrompt(input: ExplanationInput): string`
- `interface GeneratedExplanation { content: ExplanationContent; model: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } }`
- `interface ExplanationGenerator { generate(input: ExplanationInput): Promise<GeneratedExplanation> }`
- Errors: `ExplanationRefusedError`, `InvalidExplanationError`, `ExplanationsNotConfiguredError` (all `extends Error`).
- `EXPLANATION_MODEL = 'claude-opus-5'`, `EXPLANATION_OUTPUT_SCHEMA` (JSON schema object), `AnthropicExplanationGenerator(client: Anthropic)`, `FakeExplanationGenerator`, `UnconfiguredExplanationGenerator`, `clampExplanation(content): ExplanationContent`.

- [ ] **Step 1: Add SDK.** `pnpm --filter @wintel/worker add @anthropic-ai/sdk@^0.126.0` then root `pnpm install`.

- [ ] **Step 2: Failing tests**

`explanation-input.test.ts` (real Postgres):

```ts
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { EXPLANATION_PAGE_LIMIT } from '@wintel/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildExplanationInput } from './explanation-input';

let prisma: PrismaClient;

async function seed(pageCount: number) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({ data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true } });
  await prisma.organization.create({ data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` } });
  const website = await prisma.website.create({
    data: { organizationId, createdById: userId, name: 'E', url: 'https://explain.test', domain: `explain-${randomUUID().slice(0, 8)}.test`, verificationToken: 't' },
  });
  const scan = await prisma.scan.create({ data: { websiteId: website.id, organizationId, status: 'completed' } });
  const audit = await prisma.audit.create({ data: { scanId: scan.id, organizationId, status: 'completed' } });
  for (let index = pageCount - 1; index >= 0; index--) {
    const path = `/p${String(index).padStart(2, '0')}`;
    const page = await prisma.page.create({
      data: { scanId: scan.id, url: `https://explain.test${path}`, path, depth: 1, statusCode: 200, contentType: 'text/html' },
    });
    if (index === 0) {
      await prisma.pageContent.create({
        data: { pageId: page.id, html: gzipSync('<title>Zero</title><meta name="description" content="D"><h1>A</h1>') },
      });
    }
    await prisma.issue.create({
      data: { auditId: audit.id, pageId: page.id, ruleId: 'missing-canonical', severity: 'notice', message: 'no canonical', evidence: {}, fingerprint: `missing-canonical|${path}|` },
    });
  }
  return { domain: website.domain, auditId: audit.id };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('buildExplanationInput', () => {
  it('describes the rule and the first pages by path, with facts where content exists', async () => {
    const { domain, auditId } = await seed(12);

    const input = await buildExplanationInput(prisma, { auditId, ruleId: 'missing-canonical' });

    expect(input.domain).toBe(domain);
    expect(input.rule).toMatchObject({ id: 'missing-canonical', severity: 'notice', title: 'Missing canonical URL' });
    expect(input.issueCount).toBe(12);
    expect(input.affectedPageCount).toBe(12);
    expect(input.pages).toHaveLength(EXPLANATION_PAGE_LIMIT);
    expect(input.pages.map((page) => page.path)).toEqual(
      Array.from({ length: 10 }, (_value, index) => `/p${String(index).padStart(2, '0')}`),
    );
    expect(input.pages[0]!.facts).toMatchObject({ title: 'Zero', metaDescription: 'D', h1Count: 1 });
    expect(input.pages[1]!.facts).toBeNull();
  });
});
```

`prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { ExplanationInput } from './explanation-input';
import { EXPLANATION_SYSTEM_PROMPT, renderExplanationPrompt } from './prompt';

const input: ExplanationInput = {
  domain: 'acme.test',
  rule: { id: 'duplicate-title', title: 'Duplicate title', severity: 'warning', description: 'Several pages share this title.' },
  issueCount: 2,
  affectedPageCount: 2,
  pages: [
    { path: '/a', message: '2 pages share the title "Same"', evidence: { title: 'Same', duplicateCount: 2 }, facts: null },
  ],
};

describe('prompt', () => {
  it('keeps the system prompt free of request data so it caches', () => {
    expect(EXPLANATION_SYSTEM_PROMPT).not.toContain('acme.test');
    expect(EXPLANATION_SYSTEM_PROMPT.length).toBeGreaterThan(200);
  });

  it('renders the rule, counts, and pages into the user message', () => {
    const text = renderExplanationPrompt(input);

    expect(text).toContain('acme.test');
    expect(text).toContain('Duplicate title');
    expect(text).toContain('/a');
    expect(text).toContain('"duplicateCount": 2');
    expect(text).toContain('2 issues across 2 pages');
  });
});
```

`anthropic-generator.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  AnthropicExplanationGenerator,
  EXPLANATION_MODEL,
  EXPLANATION_OUTPUT_SCHEMA,
} from './anthropic-generator';
import type { ExplanationInput } from './explanation-input';
import { ExplanationRefusedError, InvalidExplanationError } from './generator';
import { EXPLANATION_SYSTEM_PROMPT } from './prompt';

const input: ExplanationInput = {
  domain: 'acme.test',
  rule: { id: 'missing-h1', title: 'Missing H1', severity: 'warning', description: 'd' },
  issueCount: 1,
  affectedPageCount: 1,
  pages: [{ path: '/about', message: 'no h1', evidence: {}, facts: null }],
};

const valid = {
  summary: 'One page lacks a main heading.',
  whyItMatters: 'Headings tell readers and search engines the topic.',
  fixes: Array.from({ length: 12 }, (_value, index) => ({ path: `/p${index}`, action: 'Add an H1' })),
  generalAdvice: ['a', 'b', 'c', 'd', 'e', 'f'],
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-opus-5',
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: JSON.stringify(valid) },
    ],
    usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 700 },
    ...overrides,
  };
}

function client(result: unknown) {
  const create = vi.fn().mockResolvedValue(result);
  return { create, anthropic: { beta: { messages: { create } } } };
}

describe('AnthropicExplanationGenerator', () => {
  it('sends a cached system prompt, fallbacks, low effort, and the output schema', async () => {
    const fake = client(response());

    await new AnthropicExplanationGenerator(fake.anthropic as never).generate(input);

    expect(fake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: EXPLANATION_MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: EXPLANATION_OUTPUT_SCHEMA } },
        system: [{ type: 'text', text: EXPLANATION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      }),
    );
  });

  it('returns validated, capped content with usage', async () => {
    const fake = client(response());

    const result = await new AnthropicExplanationGenerator(fake.anthropic as never).generate(input);

    expect(result.content.fixes).toHaveLength(10);
    expect(result.content.generalAdvice).toHaveLength(5);
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 300, cacheReadTokens: 700 });
    expect(result.model).toBe('claude-opus-5');
  });

  it('raises a refusal error when the model declines', async () => {
    const fake = client(response({ stop_reason: 'refusal', content: [] }));

    await expect(new AnthropicExplanationGenerator(fake.anthropic as never).generate(input)).rejects.toBeInstanceOf(
      ExplanationRefusedError,
    );
  });

  it('raises an invalid-explanation error for unparseable or mis-shaped output', async () => {
    const garbage = client(response({ content: [{ type: 'text', text: 'not json' }] }));
    await expect(new AnthropicExplanationGenerator(garbage.anthropic as never).generate(input)).rejects.toBeInstanceOf(
      InvalidExplanationError,
    );

    const wrong = client(response({ content: [{ type: 'text', text: '{"summary":"x"}' }] }));
    await expect(new AnthropicExplanationGenerator(wrong.anthropic as never).generate(input)).rejects.toBeInstanceOf(
      InvalidExplanationError,
    );
  });

  it('lets API errors propagate for retry', async () => {
    const create = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(
      new AnthropicExplanationGenerator({ beta: { messages: { create } } } as never).generate(input),
    ).rejects.toThrow('overloaded');
  });
});
```

`fake-generator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { ExplanationInput } from './explanation-input';
import { FakeExplanationGenerator, UnconfiguredExplanationGenerator } from './fake-generator';
import { ExplanationsNotConfiguredError } from './generator';

const input: ExplanationInput = {
  domain: 'acme.test',
  rule: { id: 'noindex', title: 'Excluded from search (noindex)', severity: 'notice', description: 'd' },
  issueCount: 1,
  affectedPageCount: 1,
  pages: [{ path: '/hidden', message: 'noindex', evidence: {}, facts: null }],
};

describe('FakeExplanationGenerator', () => {
  it('returns deterministic, visibly labeled content per page', async () => {
    const first = await new FakeExplanationGenerator().generate(input);
    const second = await new FakeExplanationGenerator().generate(input);

    expect(first).toEqual(second);
    expect(first.model).toBe('fake');
    expect(first.content.summary).toContain('[Local fake generator]');
    expect(first.content.fixes).toEqual([{ path: '/hidden', action: expect.any(String) }]);
  });
});

describe('UnconfiguredExplanationGenerator', () => {
  it('always fails as not configured', async () => {
    await expect(new UnconfiguredExplanationGenerator().generate(input)).rejects.toBeInstanceOf(
      ExplanationsNotConfiguredError,
    );
  });
});
```

- [ ] **Step 3:** Run — fail.

- [ ] **Step 4: Implement**

`generator.ts`:

```ts
import type { ExplanationContent } from '@wintel/types';

import type { ExplanationInput } from './explanation-input';

export interface GeneratedExplanation {
  content: ExplanationContent;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

/** Produces an explanation for one rule. Implementations: Anthropic, local fake, unconfigured. */
export interface ExplanationGenerator {
  generate(input: ExplanationInput): Promise<GeneratedExplanation>;
}

export const EXPLANATION_GENERATOR = Symbol('EXPLANATION_GENERATOR');

/** The model declined, even after server-side fallbacks. Not retried. */
export class ExplanationRefusedError extends Error {
  constructor() {
    super('The model declined to explain this rule');
    this.name = 'ExplanationRefusedError';
  }
}

/** The model's output did not match the explanation schema. Not retried. */
export class InvalidExplanationError extends Error {
  constructor(detail: string) {
    super(`The model returned an invalid explanation: ${detail}`);
    this.name = 'InvalidExplanationError';
  }
}

/** No provider is configured (no API key). Not retried. */
export class ExplanationsNotConfiguredError extends Error {
  constructor() {
    super('AI explanations are not configured');
    this.name = 'ExplanationsNotConfiguredError';
  }
}
```

`explanation-input.ts`:

```ts
import { gunzipSync } from 'node:zlib';

import type { PrismaClient } from '@wintel/database';
import {
  AUDIT_RULES,
  type AuditRuleId,
  EXPLANATION_PAGE_LIMIT,
  type IssueSeverity,
} from '@wintel/types';

import { type PageFacts, extractPageFacts } from '../scan-audit/page-facts';

export interface ExplanationPageInput {
  path: string;
  message: string;
  evidence: Record<string, unknown>;
  facts: PageFacts | null;
}

export interface ExplanationInput {
  domain: string;
  rule: { id: AuditRuleId; title: string; severity: IssueSeverity; description: string };
  issueCount: number;
  affectedPageCount: number;
  pages: ExplanationPageInput[];
}

function readFacts(html: Uint8Array | undefined): PageFacts | null {
  if (!html) {
    return null;
  }
  try {
    return extractPageFacts(gunzipSync(html).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * The model's entire view of the problem, built only from stored audit data. Pages are sorted by
 * path and limited, so the same audit always yields the same input; raw HTML is reduced to facts.
 */
export async function buildExplanationInput(
  client: PrismaClient,
  explanation: { auditId: string; ruleId: string },
): Promise<ExplanationInput> {
  const ruleId = explanation.ruleId as AuditRuleId;
  const rule = AUDIT_RULES[ruleId];

  const audit = await client.audit.findUniqueOrThrow({
    where: { id: explanation.auditId },
    select: { scan: { select: { website: { select: { domain: true } } } } },
  });

  const issues = await client.issue.findMany({
    where: { auditId: explanation.auditId, ruleId },
    select: {
      message: true,
      evidence: true,
      pageId: true,
      page: { select: { path: true, content: { select: { html: true } } } },
    },
    orderBy: [{ page: { path: 'asc' } }, { message: 'asc' }],
  });

  const pageIds = new Set(issues.map((issue) => issue.pageId));
  const seen = new Set<string>();
  const pages: ExplanationPageInput[] = [];
  for (const issue of issues) {
    if (seen.has(issue.page.path) || pages.length >= EXPLANATION_PAGE_LIMIT) {
      continue;
    }
    seen.add(issue.page.path);
    pages.push({
      path: issue.page.path,
      message: issue.message,
      evidence: (issue.evidence ?? {}) as Record<string, unknown>,
      facts: readFacts(issue.page.content?.html),
    });
  }

  return {
    domain: audit.scan.website.domain,
    rule: { id: ruleId, title: rule.title, severity: rule.severity, description: rule.description },
    issueCount: issues.length,
    affectedPageCount: pageIds.size,
    pages,
  };
}
```

`prompt.ts`:

```ts
import type { ExplanationInput } from './explanation-input';

/**
 * Stable across every request so it forms a cacheable prefix. Anything specific to a website or
 * rule goes in the user message instead.
 */
export const EXPLANATION_SYSTEM_PROMPT = `You explain technical SEO audit findings to website owners and developers.

You receive one audit rule, the website's domain, how many issues and pages it affects, and details for up to ten affected pages: the page path, the finding, its evidence, and facts extracted from the page (title, meta description, number of H1 headings, whether a canonical link exists, robots meta content). Facts may be missing when the page's HTML was not stored.

Write for someone who will act on the advice today:
- summary: two or three sentences describing what is wrong on this site specifically, using the counts you were given.
- whyItMatters: a short paragraph on the concrete effect for this site (search visibility, user experience, crawl efficiency). Do not exaggerate impact.
- fixes: one entry per listed page, in the order given, with the exact path and a specific action for that page. Use the page facts and evidence to be specific (for example propose a distinct title when titles collide). Never invent pages that were not listed.
- generalAdvice: up to five short, practical practices that prevent the problem from recurring.

Only use the information provided. If the data is insufficient for a page-specific action, give the most specific action the data supports and say what to check.`;

export function renderExplanationPrompt(input: ExplanationInput): string {
  const header = [
    `Website: ${input.domain}`,
    `Rule: ${input.rule.title} (${input.rule.id}, severity ${input.rule.severity})`,
    `Rule description: ${input.rule.description}`,
    `Scope: ${input.issueCount} issues across ${input.affectedPageCount} pages; ${input.pages.length} pages listed below.`,
  ].join('\n');

  return `${header}\n\nAffected pages:\n${JSON.stringify(input.pages, null, 2)}`;
}
```

`anthropic-generator.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import {
  EXPLANATION_MAX_ADVICE,
  EXPLANATION_MAX_FIXES,
  type ExplanationContent,
  explanationContentSchema,
} from '@wintel/types';

import type { ExplanationInput } from './explanation-input';
import {
  ExplanationRefusedError,
  type ExplanationGenerator,
  type GeneratedExplanation,
  InvalidExplanationError,
} from './generator';
import { EXPLANATION_SYSTEM_PROMPT, renderExplanationPrompt } from './prompt';

export const EXPLANATION_MODEL = 'claude-opus-5';
const MAX_TOKENS = 4000;

/** JSON schema for structured output; mirrors `explanationContentSchema`. */
export const EXPLANATION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'whyItMatters', 'fixes', 'generalAdvice'],
  properties: {
    summary: { type: 'string' },
    whyItMatters: { type: 'string' },
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'action'],
        properties: { path: { type: 'string' }, action: { type: 'string' } },
      },
    },
    generalAdvice: { type: 'array', items: { type: 'string' } },
  },
} as const;

export function clampExplanation(content: ExplanationContent): ExplanationContent {
  return {
    ...content,
    fixes: content.fixes.slice(0, EXPLANATION_MAX_FIXES),
    generalAdvice: content.generalAdvice.slice(0, EXPLANATION_MAX_ADVICE),
  };
}

/**
 * Claude Opus 5 at low effort with structured output. The system prompt is cached; refusals get
 * server-side fallbacks first and only then surface as `ExplanationRefusedError`.
 */
export class AnthropicExplanationGenerator implements ExplanationGenerator {
  constructor(private readonly client: Anthropic) {}

  async generate(input: ExplanationInput): Promise<GeneratedExplanation> {
    const response = await this.client.beta.messages.create({
      model: EXPLANATION_MODEL,
      max_tokens: MAX_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EXPLANATION_OUTPUT_SCHEMA } },
      system: [{ type: 'text', text: EXPLANATION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: renderExplanationPrompt(input) }],
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') {
      throw new ExplanationRefusedError();
    }

    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      throw new InvalidExplanationError('no text content');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text.text);
    } catch {
      throw new InvalidExplanationError('output was not JSON');
    }
    const parsed = explanationContentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidExplanationError('output did not match the schema');
    }

    return {
      content: clampExplanation(parsed.data),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
```

> If the SDK's types reject `fallbacks`, `output_config.format`, or the cast target name, fix to the compiler's suggested type — keep the request body exactly as above (it is what the test asserts).

`fake-generator.ts`:

```ts
import type { ExplanationInput } from './explanation-input';
import {
  type ExplanationGenerator,
  ExplanationsNotConfiguredError,
  type GeneratedExplanation,
} from './generator';

/**
 * Deterministic stand-in for local development and verification without credentials. Output is
 * labeled so it can never be mistaken for model advice. Only used when explicitly configured.
 */
export class FakeExplanationGenerator implements ExplanationGenerator {
  generate(input: ExplanationInput): Promise<GeneratedExplanation> {
    return Promise.resolve({
      model: 'fake',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      content: {
        summary: `[Local fake generator] ${input.rule.title}: ${input.issueCount} issues across ${input.affectedPageCount} pages on ${input.domain}.`,
        whyItMatters: `[Local fake generator] ${input.rule.description}`,
        fixes: input.pages.map((page) => ({
          path: page.path,
          action: `[Local fake generator] Resolve: ${page.message}`,
        })),
        generalAdvice: ['[Local fake generator] Configure ANTHROPIC_API_KEY for real explanations.'],
      },
    });
  }
}

export class UnconfiguredExplanationGenerator implements ExplanationGenerator {
  generate(): Promise<GeneratedExplanation> {
    return Promise.reject(new ExplanationsNotConfiguredError());
  }
}
```

- [ ] **Step 5:** Folder tests, worker typecheck, lint — green.
- [ ] **Step 6:** Commit `feat(worker): build grounded explanation inputs and call claude with structured output`.

---

### Task 4: Worker — processor, module, audit invalidation

**Files:** Create `explain-issue.processor.ts`, `explain-issue.processor.test.ts`, `explain-issue.module.ts`; modify `apps/worker/src/worker.module.ts`, `apps/worker/src/queues/scan-audit/scan-audit.processor.ts`, `scan-audit.processor.test.ts`.

**Interfaces:** `ExplainIssueProcessor(prisma, @Inject(EXPLANATION_GENERATOR) generator, @Inject(EXPLANATION_INPUT_BUILDER) buildInput, logger)`; `EXPLANATION_INPUT_BUILDER` symbol with `useValue: buildExplanationInput`.

- [ ] **Step 1: Failing processor test**

```ts
import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { UnrecoverableError, type Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ExplanationInput } from './explanation-input';
import { ExplainIssueProcessor } from './explain-issue.processor';
import { ExplanationRefusedError } from './generator';

let prisma: PrismaClient;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const input = { pages: [] } as unknown as ExplanationInput;
const buildInput = vi.fn().mockResolvedValue(input);

async function seedExplanation() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({ data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true } });
  await prisma.organization.create({ data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` } });
  const website = await prisma.website.create({
    data: { organizationId, createdById: userId, name: 'X', url: 'https://x.test', domain: `x-${randomUUID().slice(0, 8)}.test`, verificationToken: 't' },
  });
  const scan = await prisma.scan.create({ data: { websiteId: website.id, organizationId, status: 'completed' } });
  const audit = await prisma.audit.create({ data: { scanId: scan.id, organizationId, status: 'completed' } });
  return prisma.explanation.create({ data: { auditId: audit.id, ruleId: 'missing-h1', organizationId } });
}

function job(explanationId: string, attemptsMade = 0) {
  return { data: { explanationId }, attemptsMade, opts: { attempts: 2 } } as unknown as Job;
}

function processor(generate: ReturnType<typeof vi.fn>) {
  return new ExplainIssueProcessor({ client: prisma } as never, { generate } as never, buildInput, logger as never);
}

const generated = {
  model: 'claude-opus-5',
  usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 },
  content: { summary: 's', whyItMatters: 'w', fixes: [], generalAdvice: [] },
};

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ExplainIssueProcessor', () => {
  it('stores content, model and usage', async () => {
    const explanation = await seedExplanation();

    await processor(vi.fn().mockResolvedValue(generated)).process(job(explanation.id));

    const stored = await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } });
    expect(stored).toMatchObject({
      status: 'completed',
      model: 'claude-opus-5',
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 5,
      content: generated.content,
      error: null,
    });
  });

  it('fails a refusal without retrying', async () => {
    const explanation = await seedExplanation();

    await expect(
      processor(vi.fn().mockRejectedValue(new ExplanationRefusedError())).process(job(explanation.id)),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const stored = await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } });
    expect(stored).toMatchObject({ status: 'failed', error: 'The model declined to explain this rule' });
  });

  it('requeues a retryable error, then fails it on the final attempt', async () => {
    const explanation = await seedExplanation();
    const overloaded = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(processor(overloaded).process(job(explanation.id, 0))).rejects.toThrow('overloaded');
    expect((await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } })).status).toBe('queued');

    await expect(processor(overloaded).process(job(explanation.id, 1))).rejects.toThrow('overloaded');
    expect(await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } })).toMatchObject({
      status: 'failed',
      error: 'overloaded',
    });
  });

  it('skips an explanation that is not queued', async () => {
    const explanation = await seedExplanation();
    await prisma.explanation.update({ where: { id: explanation.id }, data: { status: 'completed' } });
    const generate = vi.fn();

    await processor(generate).process(job(explanation.id));

    expect(generate).not.toHaveBeenCalled();
  });
});
```

Append to `scan-audit.processor.test.ts`:

```ts
  it('drops explanations when the audit is re-run', async () => {
    const { audit, job } = await seedAudit();
    await prisma.explanation.create({
      data: { auditId: audit.id, ruleId: 'missing-h1', organizationId: audit.organizationId, status: 'completed' },
    });

    await processor().process(job);

    expect(await prisma.explanation.count({ where: { auditId: audit.id } })).toBe(0);
  });
```

- [ ] **Step 2:** Run — fail.

- [ ] **Step 3: Implement processor**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Prisma } from '@wintel/database';
import { EXPLAIN_ISSUE_QUEUE, explainIssueJobSchema } from '@wintel/types';
import { type Job, UnrecoverableError } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { buildExplanationInput } from './explanation-input';
import {
  EXPLANATION_GENERATOR,
  type ExplanationGenerator,
  ExplanationRefusedError,
  ExplanationsNotConfiguredError,
  InvalidExplanationError,
} from './generator';

export const EXPLANATION_INPUT_BUILDER = Symbol('EXPLANATION_INPUT_BUILDER');

function isPermanent(error: unknown): boolean {
  return (
    error instanceof ExplanationRefusedError ||
    error instanceof InvalidExplanationError ||
    error instanceof ExplanationsNotConfiguredError
  );
}

/**
 * Generates one explanation. Permanent failures (refusal, invalid output, not configured) fail
 * immediately and tell BullMQ not to retry; transient ones go back to `queued` for the single retry
 * and fail on the final attempt.
 */
@Processor(EXPLAIN_ISSUE_QUEUE)
export class ExplainIssueProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXPLANATION_GENERATOR) private readonly generator: ExplanationGenerator,
    @Inject(EXPLANATION_INPUT_BUILDER) private readonly buildInput: typeof buildExplanationInput,
    @InjectPinoLogger(ExplainIssueProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { explanationId } = explainIssueJobSchema.parse(job.data);
    const explanations = this.prisma.client.explanation;

    const { count } = await explanations.updateMany({
      where: { id: explanationId, status: 'queued' },
      data: { status: 'running', error: null },
    });
    if (count === 0) {
      this.logger.warn({ explanationId }, 'Skipping explanation job that is not queued');
      return;
    }

    const explanation = await explanations.findUniqueOrThrow({ where: { id: explanationId } });
    try {
      const input = await this.buildInput(this.prisma.client, explanation);
      const result = await this.generator.generate(input);
      await explanations.update({
        where: { id: explanationId },
        data: {
          status: 'completed',
          content: result.content as unknown as Prisma.InputJsonObject,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          error: null,
        },
      });
      this.logger.info({ explanationId, model: result.model, ...result.usage }, 'Explanation generated');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const permanent = isPermanent(error);

      await explanations.update({
        where: { id: explanationId },
        data: permanent || finalAttempt ? { status: 'failed', error: message } : { status: 'queued' },
      });
      this.logger.error({ explanationId, err: error, permanent, finalAttempt }, 'Explanation failed');

      if (permanent) {
        throw new UnrecoverableError(message);
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Module**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import { EXPLAIN_ISSUE_QUEUE } from '@wintel/types';

import { WORKER_ENV } from '../../config/worker-config.module';
import { AnthropicExplanationGenerator } from './anthropic-generator';
import { EXPLANATION_INPUT_BUILDER, ExplainIssueProcessor } from './explain-issue.processor';
import { buildExplanationInput } from './explanation-input';
import { FakeExplanationGenerator, UnconfiguredExplanationGenerator } from './fake-generator';
import { EXPLANATION_GENERATOR, type ExplanationGenerator } from './generator';

function createGenerator(env: WorkerEnv): ExplanationGenerator {
  if (env.AI_EXPLANATION_PROVIDER === 'fake') {
    return new FakeExplanationGenerator();
  }
  if (!env.ANTHROPIC_API_KEY) {
    return new UnconfiguredExplanationGenerator();
  }
  return new AnthropicExplanationGenerator(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
}

/** Explanation generation; the provider is chosen once from configuration. */
@Module({
  imports: [BullModule.registerQueue({ name: EXPLAIN_ISSUE_QUEUE })],
  providers: [
    ExplainIssueProcessor,
    { provide: EXPLANATION_GENERATOR, inject: [WORKER_ENV], useFactory: createGenerator },
    { provide: EXPLANATION_INPUT_BUILDER, useValue: buildExplanationInput },
  ],
})
export class ExplainIssueModule {}
```

Register `ExplainIssueModule` after `ScanSchedulerModule` in `worker.module.ts`.

- [ ] **Step 5: Audit invalidation.** In `ScanAuditProcessor`'s transaction add `await tx.explanation.deleteMany({ where: { auditId: data.auditId } });` right after the `issueChange.deleteMany` line.

- [ ] **Step 6:** Worker suite, typecheck, lint, build — green. Verify DI imports.
- [ ] **Step 7:** Commit `feat(worker): generate explanations in the worker and invalidate them on re-audit`.

---

### Task 5: API — explanations module

**Files:** Create under `apps/api/src/modules/explanations/`: `explanations.repository.ts`, `explanations.repository.test.ts`, `explain-issue-queue.service.ts`, `explanations.service.ts`, `explanations.service.test.ts`, `explanations.controller.ts`, `explanations.module.ts`. Modify `apps/api/src/modules/audits/audits.service.ts` (public `findAuditOrThrow`), `audits.module.ts` (export `AuditsService`), `apps/api/src/app.module.ts`, `apps/api/test/api.e2e.test.ts`.

**Interfaces:** `ExplanationsRepository.find(auditId, ruleId)`, `.countRequestedSince(organizationId, since: Date)`, `.countIssues(auditId, ruleId)`, `.queue({ auditId, ruleId, organizationId, requestedById })`; `ExplainIssueQueueService.enqueue(job: ExplainIssueJob)`; `ExplanationsService.get(scanId, organizationId, ruleId)`, `.request(scanId, principal: { organizationId; userId; role }, input, now?)`.

- [ ] **Step 1: Audits service change.** Rename private `auditOrThrow` to public `findAuditOrThrow` (update its callers in the same file) and add `exports: [AuditsService]` to `AuditsModule`.

- [ ] **Step 2: Failing tests**

`explanations.repository.test.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExplanationsRepository } from './explanations.repository';

let prisma: PrismaClient;
let repo: ExplanationsRepository;

async function seed() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({ data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true } });
  await prisma.organization.create({ data: { id: organizationId, name: 'O', slug: `o-${organizationId.slice(0, 8)}` } });
  const website = await prisma.website.create({
    data: { organizationId, createdById: userId, name: 'R', url: 'https://r.test', domain: `r-${randomUUID().slice(0, 8)}.test`, verificationToken: 't' },
  });
  const scan = await prisma.scan.create({ data: { websiteId: website.id, organizationId, status: 'completed' } });
  const audit = await prisma.audit.create({ data: { scanId: scan.id, organizationId, status: 'completed' } });
  const page = await prisma.page.create({ data: { scanId: scan.id, url: 'https://r.test/', path: '/', depth: 0 } });
  await prisma.issue.create({ data: { auditId: audit.id, pageId: page.id, ruleId: 'missing-h1', severity: 'warning', message: 'm' } });
  return { userId, organizationId, auditId: audit.id };
}

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
  repo = new ExplanationsRepository({ client: prisma } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ExplanationsRepository', () => {
  it('queues a new explanation and resets an existing one', async () => {
    const { userId, organizationId, auditId } = await seed();

    const first = await repo.queue({ auditId, ruleId: 'missing-h1', organizationId, requestedById: userId });
    await prisma.explanation.update({
      where: { id: first.id },
      data: { status: 'completed', content: { summary: 's' }, error: 'x', model: 'm' },
    });
    const again = await repo.queue({ auditId, ruleId: 'missing-h1', organizationId, requestedById: userId });

    expect(again).toMatchObject({ id: first.id, status: 'queued', error: null, model: null });
    expect(again.content).toBeNull();
  });

  it('counts issues per rule and requests per organization since a time', async () => {
    const { userId, organizationId, auditId } = await seed();
    await repo.queue({ auditId, ruleId: 'missing-h1', organizationId, requestedById: userId });

    expect(await repo.countIssues(auditId, 'missing-h1')).toBe(1);
    expect(await repo.countIssues(auditId, 'noindex')).toBe(0);
    expect(await repo.countRequestedSince(organizationId, new Date(Date.now() - 60_000))).toBe(1);
    expect(await repo.countRequestedSince(organizationId, new Date(Date.now() + 60_000))).toBe(0);
  });
});
```

`explanations.service.test.ts`:

```ts
import { ConflictException, ForbiddenException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { AI_DAILY_LIMIT } from '@wintel/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplanationsService } from './explanations.service';

const member = { organizationId: 'o1', userId: 'u1', role: 'member' as const };
const admin = { ...member, role: 'admin' as const };

describe('ExplanationsService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let audits: { findAuditOrThrow: ReturnType<typeof vi.fn> };
  let queue: { enqueue: ReturnType<typeof vi.fn> };
  let enabled: boolean;

  const service = () =>
    new ExplanationsService(repo as never, audits as never, queue as never, { AI_EXPLANATIONS_ENABLED: enabled } as never);

  const code = async (promise: Promise<unknown>) => {
    const error = (await promise.catch((caught: unknown) => caught)) as HttpException;
    return (error.getResponse() as { details: { code: string } }).details.code;
  };

  beforeEach(() => {
    enabled = true;
    repo = {
      find: vi.fn().mockResolvedValue(null),
      countIssues: vi.fn().mockResolvedValue(3),
      countRequestedSince: vi.fn().mockResolvedValue(0),
      queue: vi.fn().mockResolvedValue({ id: 'e1', status: 'queued' }),
    };
    audits = { findAuditOrThrow: vi.fn().mockResolvedValue({ id: 'a1', status: 'completed' }) };
    queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  });

  it('queues and enqueues a first explanation', async () => {
    const result = await service().request('s1', member, { ruleId: 'missing-h1', regenerate: false });

    expect(repo.queue).toHaveBeenCalledWith({ auditId: 'a1', ruleId: 'missing-h1', organizationId: 'o1', requestedById: 'u1' });
    expect(queue.enqueue).toHaveBeenCalledWith({ explanationId: 'e1' });
    expect(result).toEqual({ id: 'e1', status: 'queued' });
  });

  it('refuses when AI is disabled', async () => {
    enabled = false;
    const promise = service().request('s1', member, { ruleId: 'missing-h1', regenerate: false });

    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await code(service().request('s1', member, { ruleId: 'missing-h1', regenerate: false }))).toBe('AI_UNAVAILABLE');
  });

  it('refuses incomplete audits and rules without issues', async () => {
    audits.findAuditOrThrow.mockResolvedValue({ id: 'a1', status: 'running' });
    expect(await code(service().request('s1', member, { ruleId: 'missing-h1', regenerate: false }))).toBe('AUDIT_NOT_COMPLETED');

    audits.findAuditOrThrow.mockResolvedValue({ id: 'a1', status: 'completed' });
    repo.countIssues!.mockResolvedValue(0);
    await expect(service().request('s1', member, { ruleId: 'missing-h1', regenerate: false })).rejects.toBeInstanceOf(ConflictException);
    expect(await code(service().request('s1', member, { ruleId: 'missing-h1', regenerate: false }))).toBe('NO_ISSUES_FOR_RULE');
  });

  it('returns an existing explanation without spending', async () => {
    repo.find!.mockResolvedValue({ id: 'e0', status: 'completed' });

    expect(await service().request('s1', member, { ruleId: 'missing-h1', regenerate: false })).toEqual({ id: 'e0', status: 'completed' });
    expect(repo.queue).not.toHaveBeenCalled();
    expect(repo.countRequestedSince).not.toHaveBeenCalled();
  });

  it('only lets admins regenerate, and never while one is in progress', async () => {
    repo.find!.mockResolvedValue({ id: 'e0', status: 'completed' });
    await expect(service().request('s1', member, { ruleId: 'missing-h1', regenerate: true })).rejects.toBeInstanceOf(ForbiddenException);

    await service().request('s1', admin, { ruleId: 'missing-h1', regenerate: true });
    expect(repo.queue).toHaveBeenCalled();

    repo.queue!.mockClear();
    repo.find!.mockResolvedValue({ id: 'e0', status: 'running' });
    expect(await service().request('s1', admin, { ruleId: 'missing-h1', regenerate: true })).toEqual({ id: 'e0', status: 'running' });
    expect(repo.queue).not.toHaveBeenCalled();
  });

  it('enforces the daily cap from the start of the UTC day', async () => {
    repo.countRequestedSince!.mockResolvedValue(AI_DAILY_LIMIT);
    const now = new Date('2026-09-17T15:30:00.000Z');

    const error = (await service()
      .request('s1', member, { ruleId: 'missing-h1', regenerate: false }, now)
      .catch((caught: unknown) => caught)) as HttpException;

    expect(error.getStatus()).toBe(429);
    expect(repo.countRequestedSince).toHaveBeenCalledWith('o1', new Date('2026-09-17T00:00:00.000Z'));
  });
});
```

- [ ] **Step 3:** Run — fail.

- [ ] **Step 4: Implement**

`explanations.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@wintel/database';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Explanation rows. Reached only through an audit the service has already org-checked. */
@Injectable()
export class ExplanationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(auditId: string, ruleId: string) {
    return this.prisma.client.explanation.findUnique({ where: { auditId_ruleId: { auditId, ruleId } } });
  }

  countIssues(auditId: string, ruleId: string) {
    return this.prisma.client.issue.count({ where: { auditId, ruleId } });
  }

  countRequestedSince(organizationId: string, since: Date) {
    return this.prisma.client.explanation.count({ where: { organizationId, requestedAt: { gte: since } } });
  }

  queue(data: { auditId: string; ruleId: string; organizationId: string; requestedById: string }) {
    const reset = {
      status: 'queued' as const,
      content: Prisma.DbNull,
      model: null,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      error: null,
      requestedById: data.requestedById,
      requestedAt: new Date(),
    };
    return this.prisma.client.explanation.upsert({
      where: { auditId_ruleId: { auditId: data.auditId, ruleId: data.ruleId } },
      create: { auditId: data.auditId, ruleId: data.ruleId, organizationId: data.organizationId, requestedById: data.requestedById },
      update: reset,
    });
  }
}
```

`explain-issue-queue.service.ts`:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { EXPLAIN_ISSUE_QUEUE, type ExplainIssueJob } from '@wintel/types';
import { Queue } from 'bullmq';

/** Producer for explanation jobs: one retry with backoff for transient model/API errors. */
@Injectable()
export class ExplainIssueQueueService {
  constructor(@InjectQueue(EXPLAIN_ISSUE_QUEUE) private readonly queue: Queue<ExplainIssueJob>) {}

  async enqueue(job: ExplainIssueJob): Promise<void> {
    await this.queue.add('explain', job, { attempts: 2, backoff: { type: 'exponential', delay: 5000 } });
  }
}
```

`explanations.service.ts`:

```ts
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import {
  ACTIVE_EXPLANATION_STATUSES,
  AI_DAILY_LIMIT,
  type OrganizationRole,
  type RequestExplanationInput,
} from '@wintel/types';

import { API_ENV } from '../../config/api-config.module';
import { AuditsService } from '../audits/audits.service';
import { ExplainIssueQueueService } from './explain-issue-queue.service';
import { ExplanationsRepository } from './explanations.repository';

export interface ExplanationRequester {
  organizationId: string;
  userId: string;
  role: OrganizationRole | null;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** On-demand explanations: reads are free; generating is gated, capped, and admin-only to repeat. */
@Injectable()
export class ExplanationsService {
  constructor(
    private readonly repo: ExplanationsRepository,
    private readonly audits: AuditsService,
    private readonly queue: ExplainIssueQueueService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'AI_EXPLANATIONS_ENABLED'>,
  ) {}

  async get(scanId: string, organizationId: string, ruleId: string) {
    const audit = await this.audits.findAuditOrThrow(scanId, organizationId);
    const explanation = await this.repo.find(audit.id, ruleId);
    if (!explanation) {
      throw new NotFoundException('Explanation not found');
    }
    return explanation;
  }

  async request(
    scanId: string,
    requester: ExplanationRequester,
    input: RequestExplanationInput,
    now: Date = new Date(),
  ) {
    if (!this.env.AI_EXPLANATIONS_ENABLED) {
      throw new ServiceUnavailableException({
        message: 'AI explanations are not enabled',
        details: { code: 'AI_UNAVAILABLE' },
      });
    }

    const audit = await this.audits.findAuditOrThrow(scanId, requester.organizationId);
    if (audit.status !== 'completed') {
      throw new ConflictException({ message: 'The audit has not completed', details: { code: 'AUDIT_NOT_COMPLETED' } });
    }
    if ((await this.repo.countIssues(audit.id, input.ruleId)) === 0) {
      throw new ConflictException({ message: 'This rule has no issues in the audit', details: { code: 'NO_ISSUES_FOR_RULE' } });
    }

    const existing = await this.repo.find(audit.id, input.ruleId);
    if (existing) {
      const active = (ACTIVE_EXPLANATION_STATUSES as readonly string[]).includes(existing.status);
      if (active || !input.regenerate) {
        return existing;
      }
      if (requester.role !== 'admin' && requester.role !== 'owner') {
        throw new ForbiddenException('Only admins can regenerate explanations');
      }
    }

    const used = await this.repo.countRequestedSince(requester.organizationId, startOfUtcDay(now));
    if (used >= AI_DAILY_LIMIT) {
      throw new HttpException(
        { message: 'Daily AI explanation limit reached', details: { code: 'AI_DAILY_LIMIT' } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const explanation = await this.repo.queue({
      auditId: audit.id,
      ruleId: input.ruleId,
      organizationId: requester.organizationId,
      requestedById: requester.userId,
    });
    await this.queue.enqueue({ explanationId: explanation.id });
    return explanation;
  }
}
```

`explanations.controller.ts`:

```ts
import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { type Principal, type RequestExplanationInput, requestExplanationInputSchema } from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { ExplanationsService } from './explanations.service';

/** AI explanations of one rule in one audit. */
@Controller('scans/:id/audit/explanations')
@UseGuards(SessionGuard, RolesGuard)
export class ExplanationsController {
  constructor(private readonly explanations: ExplanationsService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Get(':ruleId')
  get(@CurrentUser() principal: Principal, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.explanations.get(id, this.orgId(principal), ruleId);
  }

  @Post()
  @HttpCode(202)
  request(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(requestExplanationInputSchema)) body: RequestExplanationInput,
  ) {
    return this.explanations.request(
      id,
      { organizationId: this.orgId(principal), userId: principal.user.id, role: principal.role },
      body,
    );
  }
}
```

`explanations.module.ts`:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EXPLAIN_ISSUE_QUEUE } from '@wintel/types';

import { AuditsModule } from '../audits/audits.module';
import { ExplainIssueQueueService } from './explain-issue-queue.service';
import { ExplanationsController } from './explanations.controller';
import { ExplanationsRepository } from './explanations.repository';
import { ExplanationsService } from './explanations.service';

/** On-demand AI explanations: gating, caps, and the producer for the worker. */
@Module({
  imports: [AuditsModule, BullModule.registerQueue({ name: EXPLAIN_ISSUE_QUEUE })],
  controllers: [ExplanationsController],
  providers: [ExplanationsService, ExplanationsRepository, ExplainIssueQueueService],
})
export class ExplanationsModule {}
```

Register after `InsightsModule` in `app.module.ts`.

- [ ] **Step 5: E2E** — append to the `scans` describe (the test app runs with `AI_EXPLANATIONS_ENABLED` unset → false):

```ts
  it('reports AI explanations as unavailable when disabled, and 401s anonymous requests', async () => {
    const anonymous = await request(app.getHttpServer())
      .post(`/api/v1/scans/${scanId}/audit/explanations`)
      .send({ ruleId: 'missing-h1' });
    expect(anonymous.status).toBe(401);

    const disabled = await request(app.getHttpServer())
      .post(`/api/v1/scans/${scanId}/audit/explanations`)
      .set('Cookie', cookie)
      .send({ ruleId: 'missing-h1' });
    expect(disabled.status).toBe(503);
    expect(disabled.body.details).toEqual({ code: 'AI_UNAVAILABLE' });
  });
```

Also obliterate `EXPLAIN_ISSUE_QUEUE` in the describe's `afterAll`.

- [ ] **Step 6:** API suite, typecheck, lint, build — green; verify DI imports.
- [ ] **Step 7:** Commit `feat(api): request and read ai explanations with caps and gating`.

---

### Task 6: Web — explanation panel

**Files:** Create `apps/web/src/lib/explanations-client.ts`, `explanations-client.test.ts`, `use-explanations.ts`, `apps/web/src/components/ai-explanation.tsx`, `ai-explanation.test.tsx`; modify `apps/web/src/components/audit-rule-group.tsx`.

**Interfaces:** `getExplanation(scanId, ruleId): Promise<Explanation | null>`, `requestExplanation(scanId, { ruleId, regenerate }): Promise<Explanation>`; `useExplanation(scanId, ruleId)` (key `['scans', scanId, 'explanations', ruleId]`, polls 2 s while active), `useRequestExplanation(scanId, ruleId)`; `<AiExplanation scanId ruleId />`.

- [ ] **Step 1: Failing tests**

`explanations-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getExplanation, requestExplanation } from './explanations-client';

afterEach(() => vi.unstubAllGlobals());

describe('explanations-client', () => {
  it('returns null when nothing was requested yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))));

    expect(await getExplanation('s1', 'missing-h1')).toBeNull();
  });

  it('posts the rule and regenerate flag', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'e1', auditId: 'a1', ruleId: 'missing-h1', status: 'queued', content: null, model: null, error: null,
            requestedAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z',
          }),
          { status: 202 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await requestExplanation('s1', { ruleId: 'missing-h1', regenerate: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/scans\/s1\/audit\/explanations$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ ruleId: 'missing-h1', regenerate: true }) }),
    );
  });

  it('surfaces the error code of a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ details: { code: 'AI_DAILY_LIMIT' } }), { status: 429 }))),
    );

    await expect(requestExplanation('s1', { ruleId: 'missing-h1', regenerate: false })).rejects.toMatchObject({
      status: 429,
      code: 'AI_DAILY_LIMIT',
    });
  });
});
```

`ai-explanation.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Explanation } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
let explanation: Explanation | null = null;
let requestError: unknown = null;

vi.mock('@/lib/use-explanations', () => ({
  isActiveExplanation: (value: Explanation | null) => value?.status === 'queued' || value?.status === 'running',
  useExplanation: () => ({ data: explanation, isPending: false, isError: false }),
  useRequestExplanation: () => ({ mutate, isPending: false, error: requestError }),
}));

import { AiExplanation } from './ai-explanation';

function make(overrides: Partial<Explanation>): Explanation {
  return {
    id: 'e1', auditId: 'a1', ruleId: 'missing-h1', status: 'completed', model: 'claude-opus-5', error: null,
    requestedAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z',
    content: {
      summary: 'One page lacks a heading.',
      whyItMatters: 'Headings convey the topic.',
      fixes: [{ path: '/about', action: 'Add an H1 naming the team' }],
      generalAdvice: ['Use one H1 per page'],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mutate.mockReset();
  explanation = null;
  requestError = null;
});

describe('AiExplanation', () => {
  it('offers to explain when nothing was requested', () => {
    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Explain with AI' }));

    expect(mutate).toHaveBeenCalledWith({ regenerate: false });
  });

  it('shows progress while generating', () => {
    explanation = make({ status: 'running', content: null });

    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(screen.getByText('Generating explanation…')).toBeInTheDocument();
  });

  it('renders the explanation with a review notice and per-page fixes', () => {
    explanation = make({});

    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(screen.getByText('One page lacks a heading.')).toBeInTheDocument();
    expect(screen.getByText('/about')).toBeInTheDocument();
    expect(screen.getByText('Add an H1 naming the team')).toBeInTheDocument();
    expect(screen.getByText('AI-generated — review before applying.')).toBeInTheDocument();
  });

  it('explains failures and friendly error codes', () => {
    explanation = make({ status: 'failed', content: null, error: 'The model declined to explain this rule' });
    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);
    expect(screen.getByText('The model declined to explain this rule')).toBeInTheDocument();
    cleanup();

    explanation = null;
    requestError = Object.assign(new Error('x'), { status: 503, code: 'AI_UNAVAILABLE' });
    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('AI explanations are not enabled for this workspace.');
  });
});
```

- [ ] **Step 2:** Run — fail.

- [ ] **Step 3: Implement**

`explanations-client.ts`:

```ts
import { type AuditRuleId, type Explanation, explanationSchema } from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** An API error that also carries the server's machine-readable `details.code`. */
export class ExplanationRequestError extends ApiError {
  constructor(
    status: number,
    readonly code: string | null,
  ) {
    super(`Explanation request failed (${status})`, status);
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { details?: { code?: string } } | null;
    throw new ExplanationRequestError(response.status, body?.details?.code ?? null);
  }

  return response;
}

export async function getExplanation(scanId: string, ruleId: AuditRuleId): Promise<Explanation | null> {
  try {
    const response = await request(`/scans/${scanId}/audit/explanations/${ruleId}`);

    return explanationSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function requestExplanation(
  scanId: string,
  body: { ruleId: AuditRuleId; regenerate: boolean },
): Promise<Explanation> {
  const response = await request(`/scans/${scanId}/audit/explanations`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return explanationSchema.parse(await response.json());
}
```

`use-explanations.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_EXPLANATION_STATUSES, type AuditRuleId, type Explanation } from '@wintel/types';

import { getExplanation, requestExplanation } from './explanations-client';

export const EXPLANATION_POLL_INTERVAL_MS = 2_000;

export function isActiveExplanation(explanation: Explanation | null | undefined): boolean {
  return (
    explanation !== null &&
    explanation !== undefined &&
    (ACTIVE_EXPLANATION_STATUSES as readonly string[]).includes(explanation.status)
  );
}

function explanationKey(scanId: string, ruleId: AuditRuleId) {
  return ['scans', scanId, 'explanations', ruleId] as const;
}

export function useExplanation(scanId: string, ruleId: AuditRuleId) {
  return useQuery({
    queryKey: explanationKey(scanId, ruleId),
    queryFn: () => getExplanation(scanId, ruleId),
    refetchInterval: (query) => (isActiveExplanation(query.state.data) ? EXPLANATION_POLL_INTERVAL_MS : false),
  });
}

export function useRequestExplanation(scanId: string, ruleId: AuditRuleId) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ regenerate }: { regenerate: boolean }) => requestExplanation(scanId, { ruleId, regenerate }),
    onSuccess: (explanation) => client.setQueryData(explanationKey(scanId, ruleId), explanation),
  });
}
```

`ai-explanation.tsx`:

```tsx
'use client';

import type { AuditRuleId } from '@wintel/types';
import { Button } from '@wintel/ui';

import { isActiveExplanation, useExplanation, useRequestExplanation } from '@/lib/use-explanations';

const ERROR_TEXT: Record<string, string> = {
  AI_UNAVAILABLE: 'AI explanations are not enabled for this workspace.',
  AI_DAILY_LIMIT: 'Your organization has reached today’s AI explanation limit.',
  NO_ISSUES_FOR_RULE: 'This rule has no issues to explain.',
  AUDIT_NOT_COMPLETED: 'Wait for the audit to finish before asking for an explanation.',
};

function describeError(error: unknown): string {
  const { status, code } = (error ?? {}) as { status?: number; code?: string | null };
  if (code && ERROR_TEXT[code]) {
    return ERROR_TEXT[code];
  }
  return status === 403 ? 'Only admins can regenerate explanations.' : 'Could not request an explanation.';
}

/** Claude's explanation of one rule in this audit: request, progress, result, regenerate. */
export function AiExplanation({ scanId, ruleId }: { scanId: string; ruleId: AuditRuleId }) {
  const { data: explanation, isPending, isError } = useExplanation(scanId, ruleId);
  const requestIt = useRequestExplanation(scanId, ruleId);

  if (isPending) {
    return null;
  }
  if (isError) {
    return <p className="text-xs text-destructive">Could not load the explanation.</p>;
  }

  const active = isActiveExplanation(explanation);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
      {requestIt.error ? (
        <p role="alert" className="text-xs text-destructive">
          {describeError(requestIt.error)}
        </p>
      ) : null}

      {explanation === null ? (
        <Button variant="outline" size="sm" disabled={requestIt.isPending} onClick={() => requestIt.mutate({ regenerate: false })}>
          Explain with AI
        </Button>
      ) : active ? (
        <p className="text-xs text-muted-foreground">Generating explanation…</p>
      ) : explanation.status === 'failed' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-destructive">{explanation.error ?? 'The explanation failed.'}</p>
          <Button variant="outline" size="sm" disabled={requestIt.isPending} onClick={() => requestIt.mutate({ regenerate: true })}>
            Try again
          </Button>
        </div>
      ) : explanation.content ? (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-sm">{explanation.content.summary}</p>
          <p className="text-muted-foreground">{explanation.content.whyItMatters}</p>
          <ul className="flex flex-col gap-1">
            {explanation.content.fixes.map((fix) => (
              <li key={fix.path} className="flex flex-col">
                <span className="font-medium">{fix.path}</span>
                <span>{fix.action}</span>
              </li>
            ))}
          </ul>
          {explanation.content.generalAdvice.length > 0 ? (
            <ul className="list-disc pl-4 text-muted-foreground">
              {explanation.content.generalAdvice.map((advice) => (
                <li key={advice}>{advice}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">AI-generated — review before applying.</span>
            <Button variant="ghost" size="sm" disabled={requestIt.isPending} onClick={() => requestIt.mutate({ regenerate: true })}>
              Regenerate
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

In `audit-rule-group.tsx`, import `AiExplanation` and render `<AiExplanation scanId={scanId} ruleId={ruleId} />` directly after the rule description `<p>` inside the open body.

- [ ] **Step 4:** Web suite, typecheck, lint, build — green.
- [ ] **Step 5:** Commit `feat(web): request and read ai explanations in the audit`.

---

### Task 7: Live verification, docs, PR

- [ ] **Step 1:** Full gates.
- [ ] **Step 2: Live.** If `ANTHROPIC_API_KEY` (or an `ant` profile) is available, run the worker with it; otherwise run with `AI_EXPLANATION_PROVIDER=fake` and say so. Start the audit test site (:8081), run `AI_EXPLANATIONS_ENABLED=true pnpm dev` (plus the provider variable for the worker). Sign up/verify/sign in, create + verify the website, scan, wait for the audit. POST an explanation for `duplicate-title` → 202 `queued`; poll GET → `completed` with content whose fixes list `/dupe-a` and `/dupe-b`; POST again without regenerate → same id, no new generation; POST for `server-error` twice quickly → one generation. Rerun the audit → GET explanation → 404. Restart the API without `AI_EXPLANATIONS_ENABLED` → POST → 503.
- [ ] **Step 3:** Stop the stack.
- [ ] **Step 4:** README + ledger. Commit `docs: note ai explanations in readme`.
- [ ] **Step 5:** Push `feat/ai-explanations`, open PR.
- [ ] **Step 6:** Wait for CI; report.

---

## Self-Review

- **Spec coverage:** goals 1–5 → Tasks 3–6; decisions (model call shape, fallbacks, structured output + caps, caching, grounded input, retry split, enablement, fake provider, daily cap, permissions, invalidation) → Tasks 2–5; error table → Task 4 processor + Task 5 service + Task 6 UI; testing plan → each task; live → Task 7.
- **Placeholders:** none.
- **Types:** `ExplanationInput` is shared by builder, prompt, generators, processor. `GeneratedExplanation` fields match what the processor stores. `ExplanationRequester.role` matches `Principal.role`. Query key `['scans', scanId, 'explanations', ruleId]` shared by both hooks.
