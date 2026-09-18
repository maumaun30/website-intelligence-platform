# AI Explanations Design — Website Intelligence Platform

**Date:** 2026-09-17
**Status:** Approved
**Slice:** 7 of N (AI explanations). Depends on slices 1–6b.

## Context

Audits (slice 5) report what is wrong; insights (6b) report how health changes. Neither tells a
user what a rule means for *their* pages or what to change. This slice adds on-demand explanations
written by Claude for one rule in one audit, grounded in the audit's own stored data.

## Goals

1. From a rule group in an audit, a user requests an explanation; Claude returns a summary, why it
   matters for this site, per-page fixes, and general advice.
2. Each explanation is generated once per (audit, rule) and read freely afterwards; admins can
   regenerate.
3. Generation runs in the worker; the web shows progress and the result.
4. Cost is bounded: on-demand only, a per-organization daily cap, token usage recorded.
5. The feature is off unless configured, and degrades clearly when it is off.

## Non-Goals

- Automatic audit summaries; chat or follow-up questions; editing pages.
- Sending raw HTML or anything beyond audit data to the model.
- Streaming output to the browser.
- Per-plan quotas (billing slice).

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Granularity | One explanation per (audit, rule), requested on demand | Cost scales with interest, not with scans; a rule group is the natural unit of advice. |
| Execution | Worker, `explain-issue` queue, `attempts: 2` with backoff; web polls every 2 s | Model calls take seconds; the API key stays out of the web-facing process. |
| Model | `claude-opus-5`, adaptive thinking, `effort: "low"`, `max_tokens` 4000 | Default model; bounded writing task, so low effort. |
| Refusals | Server-side `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`); a final `refusal` marks the explanation failed | Recommended default for Opus 5. |
| Output | Structured output (`output_config.format`, JSON schema) then Zod validation; arrays capped at 10 fixes / 5 advice items after validation | Guaranteed shape; the cap is enforced in code, not trusted to the model. |
| Caching | Frozen system prompt with `cache_control: ephemeral`; per-request data only in the user message | Repeated explanations reuse the cached prefix. |
| Model input | Rule catalog entry, domain, issue and page counts, up to 10 affected pages sorted by path: path, issue message, evidence, and page facts (title, meta description, H1 count, canonical, robots) from stored content | Grounded and deterministic; no raw HTML leaves the platform. |
| Retryability | Model/API/network errors retry once; refusal, invalid output, and "not configured" fail immediately (BullMQ `UnrecoverableError`) | Retrying a refusal or a schema miss wastes tokens. |
| Enablement | API `AI_EXPLANATIONS_ENABLED` (default false) → 503 `AI_UNAVAILABLE`; worker `ANTHROPIC_API_KEY` optional | Off by default; no key means no calls. |
| Local provider | Worker `AI_EXPLANATION_PROVIDER=anthropic|fake` (default `anthropic`); `fake` returns deterministic, visibly labeled content without network | Lets the pipeline run in dev/CI and live verification without credentials. Never the default. |
| Daily cap | 50 generations per organization per UTC day, counted by `requestedAt`; 429 `AI_DAILY_LIMIT` | Reads are free; regenerating a row twice in one day counts once (accepted imprecision). |
| Permissions | Members request a first explanation; regenerate is admin+ | First generation is the useful path; regenerating is spending. |
| Invalidation | Re-running an audit deletes its explanations (same transaction as issue replacement) | Issues changed; stale advice would mislead. |

## Architecture

### Data model

```prisma
enum ExplanationStatus { queued running completed failed }

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
}
```

### Contracts (`@wintel/types`, `explanations.ts`)

`EXPLANATION_STATUSES`, `explanationContentSchema` (`summary`, `whyItMatters`, `fixes[{path, action}]`,
`generalAdvice[]`), `explanationSchema`, `requestExplanationInputSchema` (`ruleId`, `regenerate`
default false), `EXPLAIN_ISSUE_QUEUE`, `explainIssueJobSchema` (`explanationId`), `AI_DAILY_LIMIT = 50`,
`EXPLANATION_PAGE_LIMIT = 10`, `EXPLANATION_MAX_FIXES = 10`, `EXPLANATION_MAX_ADVICE = 5`.

### API (`modules/explanations`)

- `GET /scans/:id/audit/explanations/:ruleId` (member) → explanation or 404.
- `POST /scans/:id/audit/explanations` (member; regenerate requires admin) → 202 explanation.
  503 `AI_UNAVAILABLE`; 404 scan/audit; 409 `AUDIT_NOT_COMPLETED`; 409 `NO_ISSUES_FOR_RULE`;
  existing non-regenerate → returns it (202, no cap); active row → returns it; 403 regenerate as
  member; 429 `AI_DAILY_LIMIT`.
- `AuditsService.findAuditOrThrow` becomes public; `AuditsModule` exports `AuditsService`.

### Worker (`queues/explain-issue`)

`buildExplanationInput` (Prisma → input), `EXPLANATION_SYSTEM_PROMPT` + `renderExplanationPrompt`,
`ExplanationGenerator` interface with `AnthropicExplanationGenerator`, `FakeExplanationGenerator`,
`UnconfiguredExplanationGenerator`; typed `ExplanationRefusedError`, `InvalidExplanationError`,
`ExplanationsNotConfiguredError`; `ExplainIssueProcessor` (claim, build, generate, store; retryable
errors reset to `queued` unless final attempt). `ScanAuditProcessor` deletes explanations on re-run.

### Web

`explanations-client.ts`, `use-explanations.ts`, `AiExplanation` inside an open `AuditRuleGroup`:
button → generating → result (summary, why it matters, fixes by path, advice), "AI-generated —
review before applying", regenerate, clear messages for 503/429/403/failed.

## Error Handling

| Case | Result |
|---|---|
| Feature disabled | 503 `AI_UNAVAILABLE`; UI says AI explanations are not enabled. |
| Worker has no key (provider anthropic) | Explanation `failed`: "AI explanations are not configured". |
| Refusal after fallbacks | `failed`: "The model declined to explain this rule". |
| Output fails schema | `failed`: "The model returned an invalid explanation". |
| API 429/5xx/network | Retried once; then `failed` with the error message. |
| Audit re-run | Explanations deleted; UI offers Explain again. |

## Testing

- **Unit:** input builder (order, 10-page limit, facts, missing content), prompt rendering, Anthropic
  generator against a fake client (request shape incl. fallbacks, caching, format; refusal; invalid
  JSON; caps), fake generator determinism, service rules (every status code above), web component
  states.
- **Integration:** processor with real Postgres and fake generators (success stores content and
  usage; refusal fails without retry; retryable error requeues then fails on final attempt); audit
  re-run deletes explanations.
- **E2E:** 401; 503 when disabled.
- **Live:** real Claude call only with credentials. Without them, run the stack with
  `AI_EXPLANATIONS_ENABLED=true` and `AI_EXPLANATION_PROVIDER=fake` and verify the full request →
  queue → worker → stored → UI-API flow, reported as such.

## Build Order

1. Database. 2. Types + config. 3. Worker (input, prompt, generators, processor, audit invalidation).
4. API. 5. Web. 6. Live verification, docs, PR.
