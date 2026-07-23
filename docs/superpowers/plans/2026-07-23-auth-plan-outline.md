# Auth + Organizations — Implementation Plan (OUTLINE / DRAFT)

Spec: `docs/superpowers/specs/2026-07-23-auth-design.md`. Branch: `feat/auth` (off `feat/foundation`).

**Status: task outline only.** Each task still needs its full TDD step breakdown (failing test → run → implement → verify), matching the foundation plan's granularity, before implementation. Expand task-by-task next session. Global constraints from the foundation plan (SDD, 90%+ coverage on business logic, no `process.env` in providers, conventional commits with the Opus 4.8 trailer, all gates green before commit) carry over unchanged.

Pin exact dependency versions at implementation time via Context7 / the registry — do not guess `better-auth` / `nodemailer` versions in advance.

## Build order (each task = its own implementer + review + commit)

- [ ] **Task A1: Auth + SMTP config** — extend `@wintel/config` schemas.
  - Add to the relevant env schema(s): `BETTER_AUTH_SECRET` (min length), `BETTER_AUTH_URL`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`. Derive types. Update `.env.example` files and the root `.env` docs.
  - Tests: parse/reject cases (missing secret, bad URL, non-numeric port).

- [ ] **Task A2: Auth data model** — Better Auth core + organization plugin Prisma models.
  - Add `User`, `Session`, `Account`, `Verification`, `Organization`, `Member`, `Invitation` to `packages/database/schema.prisma` with Better Auth's expected fields, relations, and unique indexes. One additive migration; regenerate the client.
  - Tests: an integration test asserting the tables exist and a user↔member↔organization row round-trips.

- [ ] **Task A3: Auth contracts** — `@wintel/types`.
  - Zod schemas + types: sign-up input, sign-in input, principal/session shape, organization DTO, member DTO, invitation input/DTO. Barrel exports.
  - Tests: schema accept/reject per DTO.

- [ ] **Task A4: Better Auth server + hooks** — `@wintel/api` `modules/auth/auth.ts`.
  - Instantiate Better Auth: Prisma adapter over `PrismaService.client`, email+password with `requireEmailVerification`, `organization` plugin, secret/URLs from injected `API_ENV` config. Hooks: `sendVerificationEmail` and `sendInvitationEmail` **enqueue** a BullMQ email job (inject the queue, never send inline); after-signup hook creates the user's personal organization and sets it active.
  - Tests: after-signup creates exactly one org with the user as owner; email hooks enqueue a job with the right payload (queue mocked).

- [ ] **Task A5: Auth HTTP surface + guards** — `@wintel/api` `modules/auth/*`.
  - Catch-all controller mounting Better Auth's Node handler at `/api/v1/auth/*`. `SessionGuard` (resolve session → attach principal + `activeOrganizationId`, 401 if absent). `RolesGuard` + `@Roles()` decorator (member role vs required, 403). `@CurrentUser()` param decorator. Extend pino redaction to auth fields.
  - Tests: guard unit tests (401/403/pass); e2e sign-up → verify → sign-in → hit a `@Roles('admin')` route.

- [ ] **Task A6: Transactional email pipeline** — `@wintel/worker`.
  - Real `email` queue + processor: render a minimal verification/invitation template, send via nodemailer to configured SMTP (Mailpit locally). Decide the fate of the placeholder `example` queue (keep as smoke test or remove).
  - Tests: processor calls the transport with the expected envelope (transport mocked); optional Mailpit integration test.

- [ ] **Task A7: Web auth UI** — `@wintel/web` (+ `@wintel/ui` Input/Label as needed).
  - Better Auth React client. Route groups: `(auth)` → `/sign-in`, `/sign-up`, `/verify`; `(app)` → authenticated shell whose layout reads the session server-side and redirects to `/sign-in` when absent. Forms from `@wintel/ui`, validated with the shared Zod schemas. Sign-out control.
  - Tests: sign-in form validation; `(app)` guard redirect with a mocked session.

- [ ] **Task A8: Full-stack wire-up + verification.**
  - `pnpm dev`: sign up → verification email lands in Mailpit → verify → sign in → dashboard; protected route returns 401/403 correctly; invite enqueues + delivers. Full gate sequence green; confirm CI runs the new tests. Update the progress ledger.

## Open questions to resolve at implementation time
- Which env schema carries `BETTER_AUTH_*` — shared base vs api-only (worker needs SMTP + APP_URL for links, not the auth secret). Split accordingly.
- Better Auth's exact Prisma model field names/casing for the current version — generate from its schema/CLI rather than hand-writing, then reconcile with the repo's Prisma conventions.
- Whether email verification is required to sign in in local dev (Mailpit makes it painless; keep it on to exercise the real flow).
