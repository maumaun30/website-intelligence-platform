# Stripe Payments Design — Website Intelligence Platform

**Date:** 2026-09-23
**Status:** Approved
**Slice:** 9 of N (Stripe payments). Depends on slice 8, whose plan enum, limit table and quota
rules this slice keeps unchanged. Stripe becomes the only thing that moves an organization between
plans.

## Context

Slice 8 gave every organization a plan (`free`/`pro`/`agency`) and enforced its limits across the
API, the worker and the web app. It deliberately stopped short of payment: `POST /billing/plan`
switches plans directly, owner-only, with no money involved. That leaves the quotas constraining
only honest users — any owner can raise their own limits for free, and every signup is an owner.

This slice closes that by making Stripe the source of truth. An owner pays through Stripe Checkout;
Stripe's Billing Portal handles every later change; webhooks are the only code that writes
`Organization.plan`. Nothing about how limits are enforced changes — only what decides which plan
an organization is on.

## Goals

1. An owner can subscribe to `pro` or `agency` through Stripe Checkout and have the plan take
   effect automatically.
2. An owner can change plan, update payment details, or cancel through Stripe's hosted Billing
   Portal.
3. Stripe webhooks are the sole writer of `Organization.plan`; the direct plan-switch endpoint is
   removed.
4. A failed payment does not immediately remove access: the organization keeps its plan while
   Stripe retries, and drops to `free` only when Stripe ends the subscription.
5. A downgrade or cancellation grandfathers existing websites and resets disallowed schedules,
   exactly as slice 8's in-app downgrade did.
6. Webhook handling is idempotent and order-tolerant: replays and out-of-order deliveries cannot
   corrupt the plan.
7. The whole flow runs locally against Stripe test mode with the Stripe CLI, and against a `fake`
   provider with no network access.

## Non-Goals

- An in-app invoice or receipt history (Stripe's Portal shows these; a read-only page can follow).
- Self-built card collection with Stripe Elements; checkout and card management stay hosted.
- Usage-based or metered billing, seats, coupons, trials, tax configuration.
- Multiple concurrent subscriptions per organization, or per-user (rather than per-organization)
  billing.
- Backfilling existing organizations onto paid plans (see Rollout).
- Dunning emails of our own — Stripe's dunning settings own retry timing and customer email.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Integration | The `stripe` SDK behind a `StripeClient` interface, selected by `STRIPE_PROVIDER=stripe\|fake` | Mirrors `AI_EXPLANATION_PROVIDER` from slice 7. Keeps our schema ours and every path testable offline. |
| Not Better Auth's Stripe plugin | Rejected | It brings its own subscription model and plan conventions beside the `PLAN_LIMITS` table slice 8 built, creating two answers to "what plan is this org on" and coupling quota rules to an auth plugin's schema. |
| Webhook processing | Inline in the request, not enqueued to the worker | A plan flip is one short transaction; Stripe already retries. Indirection would make "did this event apply?" harder to answer. Revisit only if handlers grow slow. |
| Source of truth | Webhook handlers alone write `Organization.plan`; `POST /billing/plan` is deleted | Closes slice 8's free self-upgrade hole by construction rather than by a flag someone can enable. |
| Plan column | `Organization.plan` stays exactly as slice 8 left it | Every quota check in the API and the worker keeps reading one column; no enforcement code changes. |
| Billing record | New `Subscription` model, one row per organization | Stripe ids, status and period end do not belong on `Organization`, and a separate row keeps the billing concern isolated. |
| Idempotency | `StripeEvent` table keyed on Stripe's event id, inserted in the same transaction as the write | Stripe delivers at-least-once. A duplicate insert means "already applied" and the handler returns 200 without writing twice. |
| Ordering | A subscription event older than the stored `Subscription.updatedAt` is recorded and ignored | Retries can arrive out of order; without this, a stale `updated` event can undo a newer one. |
| Payment failure | `invoice.payment_failed` sets status `past_due` and leaves the plan alone; only `customer.subscription.deleted` drops to `free` | One rule, and Stripe's dunning configuration stays the single place that decides timing. An expired card over a weekend must not clear a customer's scan schedules. |
| Downgrade side effects | Webhook handlers reuse slice 8's `evaluatePlanChange` and apply the same schedule resets | A Stripe cancellation and an in-app downgrade must leave the database in the same state. |
| Signature verification | `express.raw` mounted on the webhook path only, before the global `json()` | Verification needs the exact signed bytes; a parsed-and-restringified body fails on unicode and key order. The bootstrap already does this for Better Auth. |
| Price mapping | `STRIPE_PRICE_PRO` / `STRIPE_PRICE_AGENCY` mapped to the plan enum in one module | `free` has no price. One place to read when adding a plan. |
| Checkout linkage | `client_reference_id = organizationId`, plus `metadata.organizationId` | The webhook must attribute a session to an organization without trusting the browser's return trip. |

## Architecture

### Data model

```prisma
enum SubscriptionStatus {
  active
  trialing
  past_due
  canceled
  incomplete
}

model Subscription {
  organizationId       String             @id
  organization         Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  stripeCustomerId     String             @unique
  stripeSubscriptionId String?            @unique
  status               SubscriptionStatus
  plan                 OrganizationPlan
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean            @default(false)
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  @@map("subscription")
}

/// Every Stripe event we have applied, by Stripe's own event id. The insert is the idempotency
/// guard: a duplicate delivery collides here and the handler stops.
model StripeEvent {
  id          String   @id
  type        String
  processedAt DateTime @default(now())

  @@map("stripe_event")
}
```

`Subscription.plan` records what Stripe says the organization pays for; `Organization.plan` is what
the quota rules read. They are written together in one transaction and must never disagree.

### Contracts (`@wintel/types`, new `stripe.ts`)

```ts
export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'incomplete'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Plans that can be bought. `free` has no price and cannot be checked out. */
export const PURCHASABLE_PLANS = ['pro', 'agency'] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export const createCheckoutInputSchema = z.object({ plan: z.enum(PURCHASABLE_PLANS) });

export const subscriptionSummarySchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

/**
 * `GET /billing` keeps its slice-8 shape and gains this one field. The slice-8 schema in
 * `billing.ts` is renamed `billingPlanStateSchema` and re-exported as the base; consumers keep
 * importing `billingStateSchema`.
 */
export const billingStateSchema = billingPlanStateSchema.extend({
  subscription: subscriptionSummarySchema.nullable(),
});

export const billingRedirectSchema = z.object({ url: z.url() });
```

### API

`apps/api/src/modules/billing/` gains a Stripe client provider, a webhook controller and a
`StripeEventService`; the existing repository, service and controller stay in place.

- `POST /billing/checkout` — `@Roles('owner')`, body `{ plan }`. Creates or reuses the Stripe
  customer, opens a subscription-mode Checkout session with `client_reference_id` and
  `metadata.organizationId`, returns `{ url }`. `400` for `free`; `409 SUBSCRIPTION_EXISTS` when an
  active subscription already exists — changing plan is the Portal's job.
- `POST /billing/portal` — `@Roles('owner')`. Returns `{ url }` for a Billing Portal session.
  `409 NO_SUBSCRIPTION` when the organization has never subscribed.
- `POST /billing/webhook` — no guards and no session; authenticated solely by Stripe's signature.
  An absent, malformed or invalid signature is `400` and writes nothing.
- `GET /billing` — unchanged except for the new `subscription` field.
- `POST /billing/plan` — **removed**, with its service method, its tests, and the web app's
  plan-switch mutation and confirm dialog.

Handled events, all through one `applyEvent(event)`:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Attach `stripeSubscriptionId`; set plan from the price id; status read from the session's subscription, never assumed `active` (a card needing authentication arrives `incomplete`) |
| `customer.subscription.updated` | Plan from price id; status; `currentPeriodEnd`; `cancelAtPeriodEnd` |
| `customer.subscription.deleted` | Plan → `free`; status `canceled`; clear `stripeSubscriptionId` |
| `invoice.payment_failed` | Status → `past_due`. Plan unchanged |
| `invoice.payment_succeeded` | Status → `active` |

Every other event type is recorded and ignored with a 200.

Each handler runs one transaction that:
1. inserts the `StripeEvent` row (a unique-violation means already applied → 200, no writes);
2. upserts `Subscription`;
3. updates `Organization.plan`;
4. when the plan drops, applies slice 8's `evaluatePlanChange` schedule resets.

### Bootstrap

```ts
// create-app.ts, before app.use(json())
app.use('/api/v1/billing/webhook', raw({ type: 'application/json' }));
```

### Web

- Plan cards call `POST /billing/checkout` and redirect to the returned URL. An organization with a
  subscription instead shows one "Manage billing" button to the Portal.
- Checkout returns to `/dashboard/billing?checkout=success`, which refetches. The plan arrives by
  webhook, not by the redirect, so the page shows an "activating…" state until the plan changes.
- `past_due` shows a persistent banner with a Portal link; `cancelAtPeriodEnd` shows "pro until
  12 March".
- The slice-8 confirm dialog and client-side downgrade warning are removed with the endpoint, but
  the wording moves onto the billing page as a note on what a downgrade will do, since a Portal
  downgrade resets schedules the same way.

### Configuration

`STRIPE_PROVIDER` (`stripe`|`fake`, default `fake`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`. With `STRIPE_PROVIDER=stripe`, the key, the webhook
secret and both price ids are required; the schema rejects a half-configured API at boot rather
than at the first checkout.

## Error Handling

- Invalid webhook signature → `400`, nothing written, nothing recorded.
- A handler that throws → `500`, so Stripe retries; the `StripeEvent` insert makes the retry a
  no-op if the write already landed.
- An event for an unknown customer or organization → recorded, `200`, logged as a warning. Retrying
  cannot help.
- Checkout or Portal creation failing at Stripe → `502 STRIPE_UNAVAILABLE`; the web app offers a
  retry.
- An abandoned Checkout session leaves nothing behind but a Stripe customer.

## Testing

- `@wintel/types`: price-id ↔ plan mapping, and the purchasable-plan guard.
- Webhook handlers against **Stripe-signed fixture payloads** built with the test secret: each
  handled event; a replayed duplicate (asserting one write); an out-of-order `updated` (asserting
  it is ignored); a tampered signature (asserting `400` and no write); an unknown event type.
- Service tests on the `fake` provider for checkout and portal, including the `409` paths.
- API e2e: `POST /billing/plan` is gone (404); checkout and portal are owner-only; the webhook
  route rejects an unsigned request.
- A downgrade-by-webhook integration test asserting the schedule resets match slice 8's in-app
  downgrade.
- Web component tests: subscribe button, Portal button, `past_due` banner, "activating…" state.
- Live verification with test keys and `stripe listen`: subscribe with `4242 4242 4242 4242`;
  upgrade in the Portal; force a failure with `4000 0000 0000 0341` and confirm the plan holds at
  `past_due`; cancel and confirm the drop to `free` with schedules reset.

## Rollout

Existing organizations have no Stripe subscription, so they stay on `free` — no backfill migration
guesses at who should be paying. Granting a plan to an existing customer is a one-off script that
creates their Stripe customer and subscription, letting the normal webhook path do the write.

This also settles slice 8's open deployment questions: the free self-upgrade hole closes with the
endpoint, and slice 8's parked website-create race gets its row lock in this slice, since a quota
is now worth money.

## Build Order

1. Schema: `Subscription`, `StripeEvent`, `SubscriptionStatus`; migration.
2. `@wintel/types` Stripe contracts and price mapping (tests first).
3. Config schema and the `StripeClient` provider with its `fake` implementation.
4. Checkout and Portal endpoints.
5. Webhook controller, raw-body mount, `applyEvent` with idempotency and ordering.
6. Removal of `POST /billing/plan` and its web surface; web checkout/portal/banner states.
7. The website-create row lock carried over from slice 8.
8. Full gates plus live verification against Stripe test mode.
