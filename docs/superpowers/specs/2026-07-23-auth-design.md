# Auth + Organizations Design — Website Intelligence Platform

Slice 2 of the agreed build order (see the foundation spec). Adds authentication, organizations/teams, and role-based access control. Each slice is spec → plan → implementation; this is the spec.

## Context

The foundation slice shipped the monorepo, `@wintel/config`, `@wintel/database` (Prisma, no product models), `@wintel/api` (NestJS with a feature-module template at `modules/health`), `@wintel/worker` (BullMQ pipeline), `@wintel/ui`, `@wintel/web`, and CI. This slice adds the first product capability every later slice depends on: knowing **who** the user is and **which organization's** data they may touch.

Nothing in later slices (websites, crawler, audits, dashboards) can be built without an owner and a tenant boundary. Auth is therefore slice 2, exactly as the roadmap commits.

## Goals

1. A user can sign up with email + password, verify their email, sign in, and sign out.
2. Every user belongs to at least one organization; a signup creates a personal organization so the user is never tenant-less.
3. An organization owner/admin can invite others by email; the invitation email is delivered through the existing BullMQ worker and Mailpit locally.
4. Every API request resolves to an authenticated user and an active organization, and authorization is enforced by role (owner > admin > member) at the route boundary.
5. The web app has sign-up, sign-in, and an authenticated shell; unauthenticated users are redirected to sign-in.

## Non-Goals (this slice)

- OAuth / social login, magic links, passkeys, 2FA (Better Auth supports them; add per demand, not speculatively — YAGNI).
- Billing, seats, or plan limits on organizations.
- Fine-grained per-resource permissions beyond the three org roles. Resource-level rules arrive with the resources themselves (websites in slice 3).
- Password reset UI polish beyond the functional flow.
- Audit logging of auth events (added with observability later).

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Auth library | Better Auth | Roadmap-committed. Owns the security-critical surface (password hashing, session tokens, CSRF, verification tokens) so we never hand-roll it. TypeScript-native, Prisma adapter, first-party organization plugin. |
| Where Better Auth runs | Inside `@wintel/api` (NestJS), mounted as an Express handler | Single backend origin; the API already owns Prisma and config. The worker and web never instantiate the auth server — web talks to it over HTTP, worker only sends emails. |
| Session strategy | Better Auth database sessions (cookie holds a signed session id) | Revocable server-side (needed for "sign out everywhere" and invitation-driven membership changes); no JWT-rotation complexity this slice. |
| Multi-tenancy model | Better Auth `organization` plugin (organization / member / invitation) | First-party, matches "teams + RBAC" exactly; avoids a bespoke membership schema. |
| Personal org on signup | Auto-create an organization in the after-signup hook | Guarantees no user is tenant-less; every later query can assume an active org. |
| Roles | owner, admin, member (plugin defaults) | Sufficient for this slice; extend the access-control policy when resources need finer rules. |
| DB schema ownership | Better Auth's Prisma models live in `packages/database` `schema.prisma` | Single source of truth; api + worker already import the generated client. Models added via a real migration, replacing the foundation's "no product models". |
| Contracts | Auth/org DTOs + Zod schemas in `@wintel/types` | Same contract-package pattern as the health contract; web and api share request/response shapes. |
| Invitation email | Enqueued to a BullMQ `email` queue; worker renders + sends via nodemailer to Mailpit (SMTP) | Reuses the proven worker pipeline; email sending never blocks the API request. `MAIL_*` / SMTP config joins `@wintel/config`. |
| Config additions | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, SMTP (`SMTP_HOST/PORT/FROM`) | Boot-time Zod validation, same one-place pattern; the foundation explicitly reserved `BETTER_AUTH_SECRET`. |
| Web auth client | Better Auth React client + a route-group layout guard | Keeps session state in one place; server components read the session for redirects. |

## Architecture

### Backend (`@wintel/api`)
- `modules/auth/auth.ts` — the Better Auth server instance: Prisma adapter over `PrismaService`'s client, email+password enabled with `requireEmailVerification`, `organization` plugin, `sendVerificationEmail` / `sendInvitationEmail` hooks that **enqueue** a job (never send inline), and an after-signup hook that creates the personal org.
- `modules/auth/auth.controller.ts` — a catch-all route (`/api/v1/auth/*`) that hands the request/response to Better Auth's Node handler. Better Auth owns its own sub-routing.
- `modules/auth/session.guard.ts` — resolves the session from the request, attaches `{ user, session, activeOrganizationId }`; throws 401 when absent.
- `modules/auth/roles.guard.ts` + `@Roles(...)` decorator — checks the member's role in the active org against the required role; throws 403.
- `modules/auth/current-user.decorator.ts` — param decorator exposing the resolved principal to controllers, so business logic never re-reads the raw request.
- Secrets/URLs come from the injected config (`API_ENV`); no `process.env` reads in providers, matching the foundation rule.

### Contracts (`@wintel/types`)
- Zod schemas + derived types for sign-up / sign-in inputs, the session/principal shape, organization and member DTOs, and the invitation DTO. The web forms and the API validation pipe share them.

### Worker (`@wintel/worker`)
- A real `email` queue + processor replacing the placeholder `example` queue’s role (the example queue may stay as a smoke test or be removed). The processor renders a minimal transactional template and sends via nodemailer to the configured SMTP (Mailpit locally).

### Web (`@wintel/web`)
- Better Auth React client (`lib/auth-client.ts`).
- Route groups: `(auth)` with `/sign-in`, `/sign-up`, `/verify`; `(app)` with the authenticated dashboard shell. The `(app)` layout reads the session server-side and redirects to `/sign-in` when absent.
- Sign-in/up forms built from `@wintel/ui` (Button, plus Input/Label added to the UI package as needed), validated with the shared Zod schemas.

### Database (`packages/database`)
- New models: `User`, `Session`, `Account`, `Verification` (Better Auth core) and `Organization`, `Member`, `Invitation` (organization plugin), with the relations and indexes Better Auth expects. One additive migration.

## Testing

- **api** — session guard (401 when no cookie), roles guard (403 for insufficient role, pass for sufficient), the after-signup personal-org hook, and an e2e sign-up → verify → sign-in → access-protected-route flow against real Postgres. Email sending is asserted at the enqueue boundary (a job is added), not by talking to SMTP.
- **worker** — the email processor renders and calls the transport with the expected envelope (transport mocked); one integration test against Mailpit optional.
- **types** — schema parse/reject cases for each DTO.
- **web** — sign-in form validation and the redirect behavior of the `(app)` guard (mocked session).
- Coverage bar stays 90%+ on business logic (guards, hooks, mappers); Better Auth internals are not re-tested.

## Error Handling

- Auth failures surface as Better Auth's typed responses; the existing `AllExceptionsFilter` still flattens anything non-HTTP to a generic 500 with no secret leakage.
- Guards throw `UnauthorizedException` / `ForbiddenException` (401/403) with generic messages; no enumeration of whether an email exists.
- Invitation/verification tokens are single-use and expiring (Better Auth defaults); the API never logs tokens or password material (pino redaction extended to any auth field).

## Security Notes

- Password hashing, session signing, token generation, and CSRF are delegated to Better Auth — not reimplemented.
- Cookies: httpOnly, secure in production, `sameSite=lax`; `BETTER_AUTH_SECRET` is required and validated at boot (non-empty, min length).
- The tenant boundary is enforced server-side on every request via the active-organization membership check, never trusted from the client.
- Rate limiting on auth endpoints is noted as a follow-up (belongs with an API gateway/observability slice), not silently assumed.

## Out of Scope / Deferred

Listed under Non-Goals. Each is a deliberate deferral with a trigger (demand, or the slice that needs it), not an oversight.

## Success Criteria

1. `pnpm dev` → a browser can sign up, receive a verification email in Mailpit, verify, sign in, and land on the authenticated dashboard; sign-out returns to `/sign-in`.
2. A protected API route returns 401 without a session and 403 for a member lacking the required role.
3. Every new user has a personal organization immediately after signup.
4. An owner can invite an email; a job appears on the `email` queue and the worker delivers it to Mailpit.
5. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0; CI runs the new tests unchanged.
6. No secret or token is ever logged; the API reads all auth config from validated env, not `process.env`.

## What The Next Slice Inherits

Website management (slice 3) starts from: an authenticated principal and an active organization on every request, a `@Roles` authorization boundary to hang resource rules on, an org-scoped data model to attach websites to, a working transactional-email pipeline, and the same contract/testing/CI patterns.
