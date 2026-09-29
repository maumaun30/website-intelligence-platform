# Next slices — roadmap

**Date:** 2026-09-25
**Status:** Draft, not approved. Each slice still needs its own brainstorm → spec → plan before build.
**Depends on:** slices 1–9 (merged) and the UI direction work on `feat/ui-direction` (PR #10).

Five things were asked for after the UI pass. They are written here worst-blocker-first, with what
exists today, what each would take, and the decisions that must be made before any of them starts.

---

## A. Unverified-website notice (smallest, do first)

**Today:** verification state lives on `Website.verificationStatus` and is only visible if you open
that website's detail page (or squint at the Verification column in the list). A website added and
then forgotten stays unscannable forever with nothing telling you.

**Build:**
1. `useWebsites()` is already cached app-wide, so the app shell can derive `pending`/`failed`
   websites with no new request.
2. A dismissible-per-session banner under the topbar in `(app)/layout.tsx`: "1 website needs
   verification — Demo shop". Links straight to that website's Verification tab.
3. A matching state in the sidebar nav (a dot on Websites) so the banner can be dismissed without
   the signal disappearing entirely.
4. The detail page's Verification tab becomes the default tab while the site is unverified.

**Decisions:** dismissal lifetime (this session vs. a cookie for a week — recommend session, since
the point is that it is persistent); whether `failed` reads differently from `pending` (recommend
yes: failed names the reason and offers Check again).

**Testing:** component tests for the banner's states; the existing layout tests stay green.
**Size:** small — one component, one layout change, no API work.

---

## B. Account settings (currently missing entirely)

**Today:** there is no settings route at all. The API exposes `GET /api/v1/me` and nothing else for
self-service; better-auth already implements the rest server-side (`updateUser`, `changePassword`,
`changeEmail`, `listSessions`, `revokeSession`, `deleteUser`), but none of it is enabled or
surfaced.

**Build:** `/dashboard/settings` with three sections:
- **Profile** — name, email (email changes go through better-auth's verification flow, so the new
  address must confirm before it takes effect).
- **Security** — change password, list active sessions with device/IP/last-seen, revoke one or all,
  and (later) the linked-accounts panel from slice C.
- **Organization** — rename the org, list members and roles, invite by email (the better-auth
  organization plugin's `sendInvitationEmail` is already wired to the email queue and points at
  `/accept-invitation/:id` — a route that does not exist yet and must be built here).

**Decisions:** does account deletion ship in v1 (recommend not: it needs a data-retention answer for
scans, audits and Stripe first); who may rename the org and invite (recommend admin+, matching the
existing `@Roles` usage); whether the invitation acceptance page is part of this slice (recommend
yes — the email already promises it).

**Risks:** email change and password change are security-sensitive; both must re-check the session
and be rate-limited. Revoking sessions must not be able to touch another user's.
**Size:** medium — mostly wiring better-auth features that already exist, plus the missing
accept-invitation route.

---

## C. GitHub + Google OAuth, with account linking

**Today:** `createAuth()` enables email/password only, with `requireEmailVerification: true`. The
Prisma schema already has better-auth's `account` table, so linking needs no migration.

**Build:**
1. `socialProviders: { github: {...}, google: {...} }` in `create-auth.ts`, with client id/secret
   pairs added to the config schema as optional — a provider with no credentials must simply not
   appear, so local and CI runs stay offline.
2. `account: { accountLinking: { enabled: true, trustedProviders: ['google', 'github'] } }` so a
   user who signed up with a password and later signs in with the same **verified** email is linked
   rather than duplicated.
3. Sign-in and sign-up pages get provider buttons above the email form, with the divider from the
   design system.
4. Settings → Security gains a Linked accounts panel: connect, disconnect, and a refusal when
   disconnecting the only credential left on the account.
5. The `user.create` hook already makes a personal organization — confirm it also fires for OAuth
   signups (it should, it is a database hook) and test exactly that.

**Decisions (these matter, pick before building):**
- Linking on unverified email is an account-takeover path. Recommend: link only when the provider
  asserts a verified email **and** it matches an existing verified address; otherwise create a
  separate account and offer explicit linking from settings while signed in.
- Redirect URIs and secrets per environment; local dev needs its own OAuth app for each provider.
- Whether Google's `prompt=select_account` is forced (recommend yes; shared machines otherwise
  silently reuse the last account).

**Testing:** `create-auth.test.ts` already unit-tests the factory — extend it for provider
registration and the linking rules. No test may hit a real provider.
**Size:** medium. The config is small; the linking rules and their edge cases are the work.

---

## D. PageSpeed Insights, and feeding it to the AI

**Today:** audits are purely structural — 15 rules over stored HTML. Nothing measures real
performance, and `PageFacts` (`apps/worker/src/queues/scan-audit/page-facts.ts`) carries title,
description, H1 count, canonical and robots only.

**Build:**
1. A `pagespeed` BullMQ queue beside `scan-audit`, calling the PSI v5 API
   (`runPagespeed`, strategy `mobile` then `desktop`) for a **sample** of pages, not all of them —
   PSI is slow (10–30 s per URL) and quota-limited.
2. New `PageSpeedReport` rows: url, strategy, fetched-at, performance score, and the five Core Web
   Vitals (LCP, CLS, INP, FCP, TTFB), plus the top opportunities PSI returns.
3. Surface: a Performance tab on the website detail page, and the mobile performance score next to
   the health score. Whether performance enters the 0–100 health score is a **product decision**,
   not a technical one — recommend keeping it separate at first so the existing score stays
   comparable with its own history.
4. AI integration: extend `explanation-input.ts` so a rule that has a matching report ships its
   vitals and opportunities into the prompt, and widen the rule catalog with performance rules so
   there is something to explain.

**Decisions:** which pages get measured (recommend the homepage plus the four most-linked pages,
re-measured on a schedule, not every scan); API key handling and whether PSI runs without one
(it does, at a much lower quota — recommend requiring a key); per-plan limits, since this is a real
cost in time; how stale a report may be before the UI says so.

**Risks:** PSI is rate-limited and frequently slow or flaky, so the queue needs its own backoff and
a visible "could not measure" state. Lab data moves between runs — the UI must not present a 4-point
swing as a regression.
**Size:** large. This is a slice of its own, closer in shape to the crawler than to a UI change.

---

## E. Motion pass

**Today:** the direction's motion rules are in place (`--ease-out`, 160/240 ms, `scaleX`-only
progress, a global `prefers-reduced-motion` guard) but only transitions are used — nothing animates
on arrival.

**Build:** page and tab transitions (the View Transitions API, which Next 15 supports and which
needs no dependency), a count-up on the score when it changes, staggered row reveals on first load
only, and skeleton→content cross-fades. All of it stays behind the reduced-motion guard.

**Decisions:** count-up means `ScoreBadge` becomes a client component — acceptable, but it is the
one component the tables render most, so it should be measured. Row-stagger must never run on a
poll, only on first mount, or the overview will shimmer every two seconds.

**Risks:** this is the slice most likely to feel cheap if overdone. The rule to hold: motion may
only explain a change that actually happened (a number moved, a panel opened) — never decorate a
static page.
**Size:** small-to-medium, and best done last, after C and D have settled the surfaces.

---

## Suggested order

1. **A. Unverified notice** — small, fixes a real hole, no decisions blocking it.
2. **B. Account settings** — unblocks C's linked-accounts panel and ships the missing
   accept-invitation route.
3. **C. OAuth + linking** — lands in the settings surface B just built.
4. **D. PageSpeed** — the big one; own spec, own plan, own PR.
5. **E. Motion pass** — last, over surfaces that have stopped moving.
