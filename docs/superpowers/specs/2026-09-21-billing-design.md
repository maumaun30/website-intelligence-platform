# Billing Design — Website Intelligence Platform

**Date:** 2026-09-21
**Status:** Approved
**Slice:** 8 of N (Plans and quotas). Depends on slices 1–7. Slice 9 adds Stripe on top of the
plan enum and API surface this slice establishes.

## Context

Every capability the platform has shipped so far is unmetered. An organization can add unlimited
websites (slice 3), crawl up to `Website.maxPages` pages per scan with no ceiling above it
(slice 4), schedule daily scans on all of them (slice 6a), and request AI explanations up to a
single hard-coded `AI_DAILY_LIMIT = 50` shared by every organization regardless of who they are
(slice 7). There is no notion of a plan, nothing distinguishes a trial user from a paying one, and
the only cost control on the Claude spend is a constant in `@wintel/types`.

This slice introduces plans and enforces them. It deliberately stops short of payment: the plan
changes through an authenticated endpoint with no money involved, so slice 9 replaces that
endpoint's handler with Stripe Checkout without reshaping the schema, the quota rules, or the UI.

## Goals

1. Every organization has a plan: `free`, `pro`, or `agency`.
2. Each plan caps websites per organization, pages per scan, which scan frequencies are allowed,
   and AI explanations per calendar month.
3. Quota refusals are enforced in the API at the create/start boundary and re-checked in the
   worker, with machine-readable codes the web app can act on.
4. An owner can switch their organization's plan through the API and the web app.
5. Downgrading never destroys data: existing websites survive, disallowed scan schedules fall back
   to manual.
6. A billing page shows the current plan, all plans, and current usage against each limit.

## Non-Goals

- Payment processing, Stripe, invoices, proration, trials, coupons (slice 9).
- Usage-based or metered billing; per-seat pricing; member-count limits.
- Runtime-editable plan definitions or per-organization custom limits.
- A platform-admin role that can change another organization's plan.
- Deactivating or deleting websites that exceed a downgraded cap.
- Historical usage reporting beyond the current month.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Plan storage | `Organization.plan` — new `OrganizationPlan` enum column, default `free` | One column, no join on the quota path. Stripe price IDs map onto the same enum in slice 9. |
| Limit definitions | `PLAN_LIMITS` constant in `packages/types/src/billing.ts` | Both the API and the worker enforce quotas; a shared pure module is the pattern `evaluateScanStart` already set. A DB-backed `Plan` table buys runtime editing nobody asked for and would be reshaped by slice 9 anyway. |
| Enforcement shape | Pure `evaluateQuota(...)` returning an allow/refuse result; callers supply the counts | Keeps Prisma out of the rules, makes the rules table-driven testable, and lets the worker reuse them verbatim. |
| Where enforced | Services, not guards or decorators | Quota checks need entity context (which organization, which counts) and the worker has no guard pipeline — a decorator would force the logic to be written twice. |
| Pages per scan | Clamp: effective cap is `min(website.maxPages, plan.pagesPerScan)` | A downgrade must not break existing websites. The stored `maxPages` is preserved; only the crawl is bounded. |
| Websites, frequency, AI | Refuse with `403` and a code | These are discrete user actions with an obvious alternative (upgrade or remove something). |
| AI quota window | Per-plan count per UTC calendar month, replacing `AI_DAILY_LIMIT` | The monthly cap bounds the Claude spend on its own; keeping a second daily rule would mean two limits to explain and two codes to handle. |
| Free tier AI | Limit `0`, surfaced as locked rather than exhausted | "Not on your plan" and "used up for this month" need different UI and different codes. |
| Downgrade | Grandfather, block new: websites are kept and remain readable; websites whose `scanFrequency` is not allowed on the new plan are reset to `manual` with `nextScanAt = null`; new websites are refused while over cap | No data is destroyed, enforcement stays at the create/start boundary, and the rule still holds in slice 9 when a Stripe cancellation triggers the downgrade with no user present. |
| Who can switch | Organization `owner` only | Matches the existing role checks; `admin` can regenerate explanations but not change what the organization pays for. |
| Plan change atomicity | Plan update and frequency resets in one transaction; response reports the affected website ids | A partial downgrade would leave scheduled scans running on a plan that forbids them. |

## Architecture

### Data model

- `enum OrganizationPlan { free pro agency }`.
- `Organization`: `plan OrganizationPlan @default(free)`.
- No other schema change. Migration is additive; existing organizations become `free`, which
  grandfathers whatever they already have.

### Contracts (`@wintel/types`, new `billing.ts`)

```ts
export const PLAN_LIMITS = {
  free:   { websites: 1,  pagesPerScan: 100,   scanFrequencies: ['manual'],                    aiExplanationsPerMonth: 0 },
  pro:    { websites: 10, pagesPerScan: 1000,  scanFrequencies: ['manual', 'daily', 'weekly'], aiExplanationsPerMonth: 100 },
  agency: { websites: 50, pagesPerScan: 10000, scanFrequencies: ['manual', 'daily', 'weekly'], aiExplanationsPerMonth: 500 },
} as const satisfies Record<OrganizationPlan, PlanLimits>;

/** Countable refusals carry the numbers the UI shows; the other two do not. */
export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; code: 'PLAN_WEBSITE_LIMIT' | 'PLAN_AI_LIMIT'; limit: number; current: number }
  | { allowed: false; code: 'PLAN_SCAN_FREQUENCY' | 'PLAN_AI_LOCKED' };

export type QuotaQuery =
  | { plan: OrganizationPlan; kind: 'websites'; current: number }
  | { plan: OrganizationPlan; kind: 'aiExplanations'; current: number }
  | { plan: OrganizationPlan; kind: 'scanFrequency'; scanFrequency: ScanFrequency };

export function evaluateQuota(query: QuotaQuery): QuotaDecision;

export function effectivePageCap(plan: OrganizationPlan, websiteMaxPages: number): number;

export function evaluatePlanChange(input: {
  plan: OrganizationPlan;
  websites: { id: string; scanFrequency: ScanFrequency }[];
}): { frequencyDowngrades: string[] };
```

The crawl job payload already carries `maxPages`; whoever enqueues a scan (API or scheduler) now
sets it to `effectivePageCap(plan, website.maxPages)` rather than the raw column. No payload
change, and the crawler is untouched.

Refusal codes: `PLAN_WEBSITE_LIMIT`, `PLAN_SCAN_FREQUENCY`, `PLAN_AI_LIMIT`, `PLAN_AI_LOCKED`.
`AI_DAILY_LIMIT` and `startOfUtcDay`'s use in the explanations path are removed; a
`startOfUtcMonth` helper replaces it.

### API

New `apps/api/src/modules/billing/` following the insights/explanations layout (repository,
service, controller, module).

- `GET /billing` — any member, scoped to the principal's active organization (the pattern every
  other controller uses; no organization id in the path). Returns
  `{ plan, limits, usage: { websites, aiExplanationsThisMonth }, plans: PLAN_LIMITS }`.
- `POST /billing/plan` — `@Roles('owner')`, body `{ plan }`. Runs
  `evaluatePlanChange`, then in one transaction updates `Organization.plan` and sets
  `scanFrequency = manual, nextScanAt = null` on the listed websites. Returns the new billing state
  plus `downgradedWebsites: string[]`. Switching to the current plan is a no-op `200`.

Enforcement in existing services:

| Caller | Check | Outcome |
|---|---|---|
| `WebsitesService.create` | `evaluateQuota({ kind: 'websites', current: count })` | `403 PLAN_WEBSITE_LIMIT` |
| `WebsitesService.create` / `update` | `evaluateQuota({ kind: 'scanFrequency', scanFrequency })` | `403 PLAN_SCAN_FREQUENCY` |
| `ScansService.start` | `effectivePageCap(plan, website.maxPages)` passed as the job's `maxPages` | clamped, no refusal |
| `ExplanationsService.request` | `evaluateQuota({ kind: 'aiExplanations', current: monthCount })` | `403 PLAN_AI_LOCKED` when the limit is `0`, else `403 PLAN_AI_LIMIT` |

Error bodies keep the existing shape: `{ message, details: { code } }`.

### Worker

- `ScanSchedulerProcessor`: after `evaluateScanStart` returns a go decision, re-check the
  website's organization plan against `scanFrequency`. No longer allowed → skip the scan, clear
  `nextScanAt`, and reset the website to `manual` (an organization can downgrade between ticks).
- `ScanSchedulerProcessor` enqueues with the clamped `maxPages` too, so scheduled and manual scans
  obey the same ceiling. The crawler itself needs no change — it already honours the payload.
- `ExplainIssueProcessor`: re-check the month count before the Claude call. Over quota → `failed`
  with the refusal code and `UnrecoverableError`, so a job queued before a downgrade cannot spend.

### Web

- `/dashboard/billing`: three plan cards (current one marked), usage bars for websites and AI
  explanations this month, and a switch button. Switching opens a confirm dialog that names the
  websites whose schedules will be reset — the page calls the shared `evaluatePlanChange` on the
  website list it already loads, so the warning is computed client-side before the request; the
  server repeats the same computation authoritatively and returns `downgradedWebsites`.
- Website settings form: frequency options not on the plan are disabled with an upgrade hint; the
  `maxPages` field shows the plan ceiling.
- AI explanation panel: shows remaining explanations for the month; on `free` the request button
  is replaced by an upgrade link.
- The add-website form shows the `PLAN_WEBSITE_LIMIT` refusal with a link to the billing page.
- Navigation gains a "Plan" link. No plan badge elsewhere — the billing page is the one place that
  states the plan.

## Error Handling

- Quota refusals are `403` with `details.code`; the web client maps each code to a message and an
  upgrade link. The AI path no longer returns `429`.
- A plan switch by a non-owner is `403`; an unknown plan value is `400`.
- The scheduler's downgrade check writes a scan-less skip; it does not create a `Scan` row and
  does not surface an error to the user — the website's frequency simply reads `manual` afterwards.
- Worker-side quota failures mark the explanation `failed` with the refusal code as `error` and do
  not retry.

## Testing

- `@wintel/types`: table-driven unit tests for `evaluateQuota` (each kind, at limit, over limit,
  zero limit), `effectivePageCap` (website below / above the plan ceiling), and
  `evaluatePlanChange` (no-op upgrade, downgrade with mixed frequencies).
- API service tests: each refusal code, owner-only plan switch, transaction applies both the plan
  and the frequency resets.
- API e2e: create over the website limit → `403`; downgrade pro→free → scheduled website comes
  back `manual` with `nextScanAt` null and the response lists it; upgrade free→pro → AI request
  accepted.
- Worker tests: scheduler skips and resets a website whose plan no longer allows its frequency;
  explain processor fails a job that is over the month quota; scan processor honours the clamped
  cap.
- Web component tests: plan cards render current plan and usage bars; disabled frequency options
  on free; locked AI panel on free.

## Build Order

1. Schema: `OrganizationPlan` enum, `Organization.plan`, migration.
2. `@wintel/types` billing contracts and pure functions (tests first).
3. API billing module: repository, service, controller, e2e.
4. Enforcement in websites, scans, and explanations services; remove `AI_DAILY_LIMIT`.
5. Worker re-checks: scheduler, scan page cap on the job payload, explain processor.
6. Web: billing page, settings form gating, AI panel states, plan badge.
7. Full gates plus a live run: create over cap, downgrade, upgrade, scheduled-scan reset.
