# Foundation Implementation Plan — Website Intelligence Platform

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a production-grade Turborepo monorepo containing a Next.js web app, a NestJS API, and a BullMQ worker, all wired to Postgres and Redis, with shared config/types/database/ui packages, full linting, testing, and CI — and zero product features.

**Architecture:** pnpm workspaces orchestrated by Turborepo. Node-side shared packages (`config`, `types`, `database`) compile to CommonJS with `tsc` and are consumed via `dist`; the browser-side package (`ui`) is source-only and transpiled by Next.js. The API and worker are both NestJS applications (HTTP and standalone respectively) that share infrastructure patterns — a Prisma module and a Redis module — but run as separate processes. All environment variables are parsed and validated by Zod schemas in `@wintel/config` at boot, so a misconfigured process dies immediately with a readable message instead of failing later at runtime.

**Tech Stack:** pnpm 10, Turborepo 2, TypeScript 5, Node 22 LTS, NestJS 11, Next.js 15 + React 19, Prisma 6 + PostgreSQL 16, BullMQ 5 + Redis 7, Zod 4, Tailwind CSS 4, Vitest 3, Supertest, Pino, ESLint 9 (flat config), Prettier, Husky + lint-staged + commitlint, GitHub Actions.

## Global Constraints

- **Node version:** 22 LTS. Pinned in `.nvmrc` and every `package.json` `engines` field as `>=22.0.0 <23`.
- **Package manager:** pnpm 10. Declared in root `package.json` `packageManager` field. Never run `npm install` or `yarn` in this repo.
- **Package namespace:** every workspace package is named `@wintel/<name>`. Apps are `@wintel/web`, `@wintel/api`, `@wintel/worker`.
- **TypeScript:** `strict: true` everywhere, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. No `any` in committed code; use `unknown` and narrow.
- **Zod major version:** `^4.0.0`. Use the v4 top-level string-format API (`z.url()`, `z.email()`), not the deprecated `z.string().url()` chain.
- **Commits:** Conventional Commits, enforced by commitlint. Types allowed: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.
- **No product models, no auth, no business features.** If a step tempts you to add a `User` table or a login route, stop — that is the next slice.
- **Local ports:** web `3000`, api `4000`, Postgres `5433`, Redis `6380`, Mailpit SMTP `1025` / UI `8025`. Postgres and Redis are deliberately off their default ports to avoid colliding with anything already running on the developer's machine.
- **Every task ends with a commit.** Never batch multiple tasks into one commit.

## Deliberate Deviations From The Spec

Two, both improvements. Note them in the README so nobody thinks they are bugs:

1. **Vitest configuration is per-package, not a single Vitest workspace file.** Turborepo already handles cross-package orchestration and caching; a Vitest workspace file duplicates that responsibility and forces every package to share one runner environment (the web app needs `jsdom`, the API needs `node`). Each package owns a `vitest.config.ts`; `turbo run test` fans out.
2. **The Zod validation pipe is applied per-route, not globally.** A global pipe has no way to know which schema applies to which route. The pipe is a factory used as `@Body(new ZodValidationPipe(createThingSchema))`. This is the standard Zod-with-Nest pattern and gives per-endpoint type inference.

## File Structure

```
website-intelligence-platform/
├── .github/workflows/ci.yml            CI: lint, typecheck, test, build
├── .husky/{pre-commit,commit-msg}      Git hooks
├── .nvmrc                              Node 22
├── .gitignore
├── .prettierrc.json / .prettierignore
├── commitlint.config.js
├── docker-compose.yml                  Postgres 16, Redis 7, Mailpit
├── eslint.config.mjs                   Root flat config (repo-level files)
├── package.json                        Workspace root, scripts, devDeps
├── pnpm-workspace.yaml                 Workspace globs + allowed build scripts
├── turbo.json                          Task graph
├── README.md                           Setup + architecture notes
│
├── packages/
│   ├── tsconfig/                       Shared tsconfig presets (no build)
│   │   ├── base.json / node-library.json / nest.json / react-library.json / next.json
│   │   └── package.json
│   ├── eslint-config/                  Shared ESLint flat configs (no build)
│   │   ├── base.js / react.js / package.json
│   ├── config/                         Env parsing + shared constants  [built → dist]
│   │   ├── src/errors.ts               EnvValidationError
│   │   ├── src/load-env.ts             loadEnv()
│   │   ├── src/schemas.ts              base/database/redis/api/worker env schemas
│   │   ├── src/index.ts                Barrel
│   │   └── src/*.test.ts
│   ├── types/                          Shared contracts               [built → dist]
│   │   ├── src/health.ts               HealthCheckResponse + zod schema
│   │   ├── src/index.ts
│   │   └── src/health.test.ts
│   ├── database/                       Prisma schema + client factory [built → dist]
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/          Baseline migration
│   │   ├── generated/client/           Prisma output (gitignored)
│   │   ├── src/create-client.ts
│   │   ├── src/index.ts
│   │   └── src/database.test.ts        Integration test against real Postgres
│   └── ui/                             React components (source-only)
│       ├── src/lib/utils.ts            cn()
│       ├── src/components/button.tsx
│       ├── src/index.ts
│       ├── components.json             shadcn CLI target
│       └── src/components/button.test.tsx
│
└── apps/
    ├── api/
    │   ├── src/main.ts                        Bootstrap, Pino, CORS, shutdown hooks
    │   ├── src/app.module.ts
    │   ├── src/config/api-config.module.ts    Validated env as an injectable
    │   ├── src/common/filters/all-exceptions.filter.ts
    │   ├── src/common/pipes/zod-validation.pipe.ts
    │   ├── src/infrastructure/prisma/{prisma.module.ts,prisma.service.ts}
    │   ├── src/infrastructure/redis/{redis.module.ts,redis.service.ts}
    │   ├── src/modules/health/{health.module.ts,health.controller.ts,health.service.ts}
    │   └── test/health.e2e.test.ts
    ├── worker/
    │   ├── src/main.ts
    │   ├── src/worker.module.ts
    │   ├── src/infrastructure/redis/{redis.module.ts,redis.service.ts}
    │   ├── src/queues/example/{example.constants.ts,example.processor.ts,example.module.ts}
    │   └── test/example-queue.e2e.test.ts
    └── web/
        ├── src/app/{layout.tsx,page.tsx,globals.css,providers.tsx}
        ├── src/lib/api-client.ts
        ├── src/components/health-status.tsx
        ├── src/components/health-status.test.tsx
        └── next.config.ts / postcss.config.mjs / vitest.config.ts
```

---

### Task 1: Workspace skeleton — pnpm, Turborepo, shared tsconfig and ESLint presets

Nothing else can be built until the workspace resolves. This task produces a repo where `pnpm install`, `pnpm lint`, and `pnpm typecheck` all succeed against an empty workspace.

**Files:**
- Create: `.nvmrc`, `.gitignore`, `.prettierrc.json`, `.prettierignore`
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`
- Create: `packages/tsconfig/package.json`, `packages/tsconfig/base.json`, `packages/tsconfig/node-library.json`, `packages/tsconfig/nest.json`, `packages/tsconfig/react-library.json`, `packages/tsconfig/next.json`
- Create: `packages/eslint-config/package.json`, `packages/eslint-config/base.js`, `packages/eslint-config/react.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `@wintel/tsconfig` presets referenced by every other package as `"extends": "@wintel/tsconfig/<preset>.json"`. `@wintel/eslint-config` exports `base` (default export, an array of flat config objects) and `react` (from `@wintel/eslint-config/react`, also an array). Turbo tasks `build`, `dev`, `lint`, `typecheck`, `test`, `clean`.

- [ ] **Step 1: Create the Node version pin and ignore files**

`.nvmrc`:
```
22
```

`.gitignore`:
```gitignore
node_modules/
dist/
.next/
out/
build/
coverage/
.turbo/
*.tsbuildinfo

# Prisma generated client
packages/database/generated/

# Env
.env
.env.local
.env.*.local
!.env.example

# Editors / OS
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
```

`.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

`.prettierignore`:
```
node_modules
dist
.next
coverage
.turbo
pnpm-lock.yaml
packages/database/generated

# Workflow artifacts, not source. Reformatting them only produces churn.
.superpowers
docs/superpowers
```

- [ ] **Step 2: Create the workspace root manifest and pnpm workspace file**

`package.json`:
```json
{
  "name": "website-intelligence-platform",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.13.1",
  "engines": {
    "node": ">=22.0.0 <23"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,mjs,json,md,css}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,mjs,json,md,css}\""
  },
  "devDependencies": {
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "eslint": "^9.30.0",
    "prettier": "^3.6.0",
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  }
}
```

`pnpm-workspace.yaml` — the `onlyBuiltDependencies` list is mandatory: pnpm 10 blocks lifecycle scripts by default, and Prisma, esbuild, and Tailwind's native binary all need theirs to run.
```yaml
packages:
  - 'apps/*'
  - 'packages/*'

onlyBuiltDependencies:
  - '@prisma/client'
  - '@prisma/engines'
  - '@tailwindcss/oxide'
  - esbuild
  - prisma
  - sharp
  - unrs-resolver
```

- [ ] **Step 3: Create the Turborepo task graph**

`turbo.json` — note `build` in `packages/database` runs `prisma generate` first, so `^build` ordering is all any consumer needs.
```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": [".env"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "generated/**"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 4: Create the shared tsconfig package**

`packages/tsconfig/package.json`:
```json
{
  "name": "@wintel/tsconfig",
  "version": "0.0.0",
  "private": true,
  "engines": { "node": ">=22.0.0 <23" },
  "files": ["base.json", "node-library.json", "nest.json", "react-library.json", "next.json"]
}
```

`packages/tsconfig/base.json` — compiler *behaviour* only. No module or emit settings; those differ per target and live in the presets below.
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Base",
  "compilerOptions": {
    "target": "ES2023",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`packages/tsconfig/node-library.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Node Library",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2023"],
    "outDir": "${configDir}/dist",
    "rootDir": "${configDir}/src",
    "types": ["node"]
  },
  "exclude": ["node_modules", "dist"]
}
```

`${configDir}` is required here, not decoration. A plain relative `"outDir": "dist"` resolves against the file that *declares* it — this preset — so every consuming package would emit into `packages/tsconfig/dist` and typecheck would fail with `TS6059`. `${configDir}` (TypeScript 5.5+) defers resolution to the config that ultimately extends it.

Tests live in `src` and are intentionally **not** excluded here — `typecheck` must cover them. Each package adds a `tsconfig.build.json` that excludes `src/**/*.test.ts` from emit.

`packages/tsconfig/nest.json` — NestJS uses legacy decorators and DI-assigned properties, hence `experimentalDecorators` and `strictPropertyInitialization: false`.
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "NestJS",
  "extends": "./node-library.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strictPropertyInitialization": false,
    "declaration": false,
    "declarationMap": false
  }
}
```

`packages/tsconfig/react-library.json` — source-only package, never emits.
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "React Library",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false
  },
  "exclude": ["node_modules", "dist"]
}
```

`packages/tsconfig/next.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Next.js",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": true,
    "incremental": true,
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false,
    "isolatedModules": true,
    "plugins": [{ "name": "next" }]
  },
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 5: Create the shared ESLint config package**

`packages/eslint-config/package.json`:
```json
{
  "name": "@wintel/eslint-config",
  "version": "0.0.0",
  "private": true,
  "engines": { "node": ">=22.0.0 <23" },
  "type": "module",
  "exports": {
    ".": "./base.js",
    "./react": "./react.js"
  },
  "dependencies": {
    "@eslint/js": "^9.30.0",
    "eslint-config-prettier": "^10.1.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "globals": "^16.2.0",
    "typescript-eslint": "^8.35.0"
  }
}
```

`packages/eslint-config/base.js`:
```js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', 'generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  prettier,
];
```

`packages/eslint-config/react.js`:
```js
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import base from './base.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
];
```

- [ ] **Step 6: Create the root ESLint config**

`eslint.config.mjs`:
```js
import base from '@wintel/eslint-config';

// This is the config ESLint finds when it is invoked from the repo root — which is how
// lint-staged runs on commit. It therefore has to cover apps/ and packages/ too, or staged
// files inside a workspace package would be silently skipped by the pre-commit gate.
//
// Framework-specific rules (React, Next, NestJS) live in each package's own eslint.config.mjs
// and run under `pnpm lint`, which invokes ESLint from inside each package.
export default base;
```

Do **not** add `{ ignores: ['apps/**', 'packages/**'] }` here. It reads as "each package lints itself", but lint-staged passes absolute paths to ESLint from the repo root, so those ignores would silently drop every staged file in a workspace package and the pre-commit gate would pass on code it never looked at.

- [ ] **Step 7: Install and verify the workspace resolves**

Run:
```bash
pnpm install
```
Expected: install completes, `node_modules/@wintel/tsconfig` and `node_modules/@wintel/eslint-config` exist as symlinks into `packages/`.

Then run:
```bash
pnpm exec eslint . && pnpm format:check
```
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "build: scaffold pnpm workspace with turborepo, tsconfig and eslint presets"
```

---

### Task 2: Git hooks and Conventional Commits enforcement

Wire the quality gates before any real code lands, so every subsequent commit is checked.

**Files:**
- Create: `commitlint.config.mjs`, `.husky/pre-commit`, `.husky/commit-msg`
- Modify: `package.json` (add `prepare` script, `lint-staged` block, devDependencies)

**Interfaces:**
- Consumes: root `package.json` from Task 1.
- Produces: a `prepare` script that installs Husky on `pnpm install`; `pre-commit` runs lint-staged; `commit-msg` runs commitlint.

- [ ] **Step 1: Install the tooling**

Run:
```bash
pnpm add -Dw husky lint-staged @commitlint/cli @commitlint/config-conventional
```

- [ ] **Step 2: Add the commitlint configuration**

`commitlint.config.mjs` — the `.mjs` extension is deliberate. The root `package.json` has no `"type": "module"` (adding one would break the CommonJS tooling in the Node packages), so an ESM config file has to declare itself through its extension.
```js
/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'build', 'ci', 'perf', 'style', 'revert'],
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
  },
};
```

- [ ] **Step 3: Add lint-staged and the prepare script to the root package.json**

Add to `package.json` `scripts`:
```json
"prepare": "husky"
```

Add a top-level `lint-staged` block to `package.json`:
```json
"lint-staged": {
  "*.{ts,tsx,js,jsx,mjs}": [
    "prettier --write",
    "eslint --fix --max-warnings=0"
  ],
  "*.{json,md,css,yml,yaml}": [
    "prettier --write"
  ]
}
```

- [ ] **Step 4: Initialise Husky and write the hooks**

Run:
```bash
pnpm run prepare
```
Expected: a `.husky/` directory is created.

`.husky/pre-commit`:
```sh
pnpm exec lint-staged
```

`.husky/commit-msg`:
```sh
pnpm exec commitlint --edit "$1"
```

Make them executable:
```bash
chmod +x .husky/pre-commit .husky/commit-msg
```

- [ ] **Step 5: Verify the commit-msg hook rejects a bad message**

Run:
```bash
echo "bad message with no type" | pnpm exec commitlint
```
Expected: non-zero exit, output containing `subject may not be empty` and `type may not be empty`.

Then verify a good message passes:
```bash
echo "feat: add thing" | pnpm exec commitlint
```
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: enforce conventional commits with husky, lint-staged and commitlint"
```

---

### Task 3: Local infrastructure — Docker Compose and README

Give every developer (and CI) a one-command Postgres, Redis, and mail catcher.

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `README.md`
- Modify: `package.json` (add the `infra:*` scripts; the `db:*` scripts arrive in Task 6)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DATABASE_URL=postgresql://wintel:wintel@localhost:5433/wintel?schema=public` and `REDIS_URL=redis://localhost:6380` — the exact connection strings every later task assumes. Root scripts `infra:up`, `infra:down`, `infra:reset`.

- [ ] **Step 1: Write the compose file**

`docker-compose.yml` — healthchecks matter: later tasks and CI wait on them before running migrations.
```yaml
name: wintel

services:
  postgres:
    image: postgres:16-alpine
    container_name: wintel-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: wintel
      POSTGRES_PASSWORD: wintel
      POSTGRES_DB: wintel
    ports:
      - '5433:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U wintel -d wintel']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: wintel-redis
    restart: unless-stopped
    command: ['redis-server', '--appendonly', 'yes']
    ports:
      - '6380:6379'
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 10

  mailpit:
    image: axllent/mailpit:latest
    container_name: wintel-mailpit
    restart: unless-stopped
    ports:
      - '1025:1025'
      - '8025:8025'
    environment:
      MP_MAX_MESSAGES: 500
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1

volumes:
  postgres-data:
  redis-data:
```

- [ ] **Step 2: Write the root env example**

`.env.example` — the root file documents the shared infrastructure; each app gets its own `.env.example` in its own task.
```bash
# Shared local infrastructure (see docker-compose.yml)
DATABASE_URL="postgresql://wintel:wintel@localhost:5433/wintel?schema=public"
REDIS_URL="redis://localhost:6380"
```

- [ ] **Step 3: Add infrastructure scripts to the root package.json**

Add to `package.json` `scripts`:
```json
"infra:up": "docker compose up -d --wait",
"infra:down": "docker compose down",
"infra:reset": "docker compose down -v && docker compose up -d --wait"
```

`--wait` blocks until healthchecks pass, which is what makes `pnpm infra:up && pnpm test` reliable.

- [ ] **Step 4: Bring the infrastructure up and verify it**

Run:
```bash
pnpm infra:up
```
Expected: exits 0 with all three containers reported healthy.

Verify Postgres:
```bash
docker exec wintel-postgres psql -U wintel -d wintel -c 'SELECT 1 AS ok;'
```
Expected output includes:
```
 ok
----
  1
```

Verify Redis:
```bash
docker exec wintel-redis redis-cli ping
```
Expected: `PONG`

- [ ] **Step 5: Write the README**

`README.md`:
````markdown
# Website Intelligence Platform

AI-powered platform that continuously monitors websites and helps agencies, developers, and
businesses identify, prioritize, and resolve technical issues.

This repository currently contains the **foundation slice**: the monorepo, shared packages, and
three running applications wired to Postgres and Redis. There are no product features yet.

## Requirements

- Node 22 LTS (`nvm use`)
- pnpm 10 (`corepack enable`)
- Docker with Compose v2

## Quick start

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up      # Postgres, Redis, Mailpit
pnpm db:migrate    # apply migrations
pnpm dev           # web + api + worker
```

Then open:

| Service       | URL                              |
| ------------- | -------------------------------- |
| Web dashboard | http://localhost:3000            |
| API health    | http://localhost:4000/api/v1/health |
| Mailpit inbox | http://localhost:8025            |

## Ports

Postgres and Redis run on non-default host ports so they don't collide with anything already
installed locally.

| Service    | Host port |
| ---------- | --------- |
| web        | 3000      |
| api        | 4000      |
| Postgres   | 5433      |
| Redis      | 6380      |
| Mailpit UI | 8025      |
| Mailpit SMTP | 1025    |

## Repository layout

| Path                 | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `apps/web`           | Next.js 15 dashboard                                      |
| `apps/api`           | NestJS REST API (`/api/v1`)                               |
| `apps/worker`        | NestJS standalone BullMQ worker                           |
| `packages/config`    | Zod-validated environment schemas and shared constants    |
| `packages/types`     | Shared contracts consumed by every client                 |
| `packages/database`  | Prisma schema, migrations, and client factory             |
| `packages/ui`        | Shared React components (source-only, transpiled by Next) |
| `packages/tsconfig`  | Shared TypeScript presets                                 |
| `packages/eslint-config` | Shared ESLint flat configs                            |

## Architecture notes

**Shared package build strategy.** Node-side packages (`config`, `types`, `database`) compile to
CommonJS with `tsc` and are consumed through `dist`. The browser-side package (`ui`) ships
TypeScript source and is transpiled by Next.js via `transpilePackages`. This avoids maintaining a
bundler for a package only one consumer uses, and avoids the `"use client"` directive being
stripped by an intermediate build step.

**Two deliberate deviations from the design spec:**

1. Vitest is configured per-package rather than through a single Vitest workspace file. Turborepo
   already orchestrates cross-package test runs, and each package needs its own environment
   (`node` for the API, `jsdom` for the web app).
2. The Zod validation pipe is applied per-route (`@Body(new ZodValidationPipe(schema))`) rather
   than globally, because a global pipe cannot know which schema applies to which route.

## Testing

```bash
pnpm infra:up
pnpm test
```

Integration tests in `packages/database`, `apps/api`, and `apps/worker` run against the real
Postgres and Redis from Docker Compose. They are not mocked, on purpose: the value of these tests
is proving the wiring works.

## Commits

Conventional Commits, enforced by commitlint on `commit-msg`. `pre-commit` runs Prettier and
ESLint over staged files via lint-staged.
````

The `pnpm db:migrate` script referenced above is created in Task 6. That is expected — the README describes the finished foundation.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: add local docker compose infrastructure and project readme"
```

---

### Task 4: `@wintel/config` — environment loading and Zod validation

The first real package, and the first to follow the TDD cycle. Every app boots through `loadEnv`, so a bug here is a bug everywhere.

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/tsconfig.build.json`, `packages/config/eslint.config.mjs`, `packages/config/vitest.config.ts`
- Create: `packages/config/src/errors.ts`, `packages/config/src/load-dotenv.ts`, `packages/config/src/load-env.ts`, `packages/config/src/schemas.ts`, `packages/config/src/index.ts`
- Test: `packages/config/src/load-env.test.ts`, `packages/config/src/schemas.test.ts`

**Interfaces:**
- Consumes: `@wintel/tsconfig/node-library.json`, `@wintel/eslint-config`.
- Produces, all exported from `@wintel/config`:
  - `class EnvValidationError extends Error`
  - `function loadDotenv(candidatePaths?: string[]): string[]`
  - `function loadEnv<TOutput>(schema: ZodType<TOutput>, source?: Record<string, string | undefined>): TOutput`
  - `baseEnvSchema`, `databaseEnvSchema`, `redisEnvSchema`, `apiEnvSchema`, `workerEnvSchema`
  - `type ApiEnv = { NODE_ENV: 'development'|'test'|'production'; LOG_LEVEL: LogLevel; DATABASE_URL: string; REDIS_URL: string; PORT: number; CORS_ORIGINS: string[] }`
  - `type WorkerEnv = { NODE_ENV: ...; LOG_LEVEL: LogLevel; DATABASE_URL: string; REDIS_URL: string; WORKER_CONCURRENCY: number }`
  - `type LogLevel = 'fatal'|'error'|'warn'|'info'|'debug'|'trace'`

- [ ] **Step 1: Create the package manifest and TypeScript configs**

`packages/config/package.json`:
```json
{
  "name": "@wintel/config",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "dotenv": "^16.6.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "eslint": "^9.30.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`packages/config/tsconfig.json`:
```json
{
  "extends": "@wintel/tsconfig/node-library.json",
  "include": ["src"]
}
```

`packages/config/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

`packages/config/eslint.config.mjs`:
```js
import base from '@wintel/eslint-config';

export default base;
```

`packages/config/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

Install:
```bash
pnpm install
```

- [ ] **Step 2: Write the failing tests for `loadEnv`**

`packages/config/src/load-env.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EnvValidationError } from './errors';
import { loadEnv } from './load-env';

const schema = z.object({
  REQUIRED_VALUE: z.string().min(1),
  OPTIONAL_VALUE: z.string().default('fallback'),
});

describe('loadEnv', () => {
  it('returns the parsed value when the source is valid', () => {
    const result = loadEnv(schema, { REQUIRED_VALUE: 'present' });

    expect(result).toEqual({ REQUIRED_VALUE: 'present', OPTIONAL_VALUE: 'fallback' });
  });

  it('throws EnvValidationError when a required variable is missing', () => {
    expect(() => loadEnv(schema, {})).toThrow(EnvValidationError);
  });

  it('names every offending variable in the error message', () => {
    let message = '';
    try {
      loadEnv(schema, { REQUIRED_VALUE: '' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('Invalid environment configuration');
    expect(message).toContain('REQUIRED_VALUE');
  });

  it('reads from process.env when no source is given', () => {
    process.env.REQUIRED_VALUE = 'from-process-env';

    const result = loadEnv(schema);

    expect(result.REQUIRED_VALUE).toBe('from-process-env');
    delete process.env.REQUIRED_VALUE;
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run:
```bash
pnpm --filter @wintel/config test
```
Expected: FAIL — `Failed to resolve import "./errors"` and `"./load-env"`.

- [ ] **Step 4: Implement `EnvValidationError` and `loadEnv`**

`packages/config/src/errors.ts`:
```ts
/**
 * Thrown when a process starts with an environment that does not satisfy its schema.
 * Always fatal: a process that cannot trust its configuration must not serve traffic.
 */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}
```

`packages/config/src/load-env.ts`:
```ts
import type { ZodType } from 'zod';

import { EnvValidationError } from './errors';

/**
 * Parses and validates an environment source against a schema.
 *
 * @throws {EnvValidationError} with every offending variable listed, so a misconfigured
 * deployment is diagnosable from a single log line rather than one restart per mistake.
 */
export function loadEnv<TOutput>(
  schema: ZodType<TOutput>,
  source: Record<string, string | undefined> = process.env,
): TOutput {
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new EnvValidationError(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run:
```bash
pnpm --filter @wintel/config test
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing tests for the environment schemas**

`packages/config/src/schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { loadEnv } from './load-env';
import { apiEnvSchema, workerEnvSchema } from './schemas';

const validInfra = {
  DATABASE_URL: 'postgresql://wintel:wintel@localhost:5433/wintel?schema=public',
  REDIS_URL: 'redis://localhost:6380',
};

describe('apiEnvSchema', () => {
  it('applies defaults for everything except the infrastructure URLs', () => {
    const env = loadEnv(apiEnvSchema, validInfra);

    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('coerces PORT from a string to a number', () => {
    const env = loadEnv(apiEnvSchema, { ...validInfra, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('splits and trims CORS_ORIGINS into a list', () => {
    const env = loadEnv(apiEnvSchema, {
      ...validInfra,
      CORS_ORIGINS: 'https://a.test, https://b.test ,',
    });

    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('rejects a DATABASE_URL that is not a URL', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validInfra, DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validInfra, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv(apiEnvSchema, { ...validInfra, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});

describe('workerEnvSchema', () => {
  it('defaults WORKER_CONCURRENCY to 5', () => {
    const env = loadEnv(workerEnvSchema, validInfra);

    expect(env.WORKER_CONCURRENCY).toBe(5);
  });

  it('coerces WORKER_CONCURRENCY from a string', () => {
    const env = loadEnv(workerEnvSchema, { ...validInfra, WORKER_CONCURRENCY: '12' });

    expect(env.WORKER_CONCURRENCY).toBe(12);
  });
});
```

- [ ] **Step 7: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/config test
```
Expected: FAIL — `Failed to resolve import "./schemas"`.

- [ ] **Step 8: Implement the schemas**

`packages/config/src/schemas.ts`:
```ts
import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Settings every process in the platform shares. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

export const redisEnvSchema = z.object({
  REDIS_URL: z.url(),
});

export const apiEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export const workerEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
```

Shapes are spread rather than composed with `.merge()`, which Zod 4 deprecates in favour of `.extend()`; spreading `.shape` is stable across both major versions and keeps each schema readable as a flat list.

- [ ] **Step 9: Run and confirm the schema tests pass**

Run:
```bash
pnpm --filter @wintel/config test
```
Expected: PASS, 12 tests total.

- [ ] **Step 10: Implement `loadDotenv` and the barrel**

`packages/config/src/load-dotenv.ts`:
```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as readDotenvFile } from 'dotenv';

/**
 * Loads `.env` files into `process.env` without overriding variables that are already set,
 * so a real deployment environment always wins over a stray file on disk.
 *
 * Defaults walk from the most specific location (the app's own directory) to the least
 * (the monorepo root). Missing files are skipped silently — they are optional by design.
 *
 * @returns the absolute paths that were actually loaded, in load order.
 */
export function loadDotenv(candidatePaths: string[] = ['.env', '../../.env']): string[] {
  const loaded: string[] = [];

  for (const candidate of candidatePaths) {
    const absolutePath = resolve(process.cwd(), candidate);
    if (!existsSync(absolutePath)) {
      continue;
    }

    readDotenvFile({ path: absolutePath });
    loaded.push(absolutePath);
  }

  return loaded;
}
```

`packages/config/src/index.ts`:
```ts
export { EnvValidationError } from './errors';
export { loadDotenv } from './load-dotenv';
export { loadEnv } from './load-env';
export {
  LOG_LEVELS,
  apiEnvSchema,
  baseEnvSchema,
  databaseEnvSchema,
  redisEnvSchema,
  workerEnvSchema,
} from './schemas';
export type { ApiEnv, BaseEnv, LogLevel, WorkerEnv } from './schemas';
```

- [ ] **Step 11: Verify the package builds, lints and typechecks**

Run:
```bash
pnpm --filter @wintel/config run build && pnpm --filter @wintel/config run lint && pnpm --filter @wintel/config run typecheck
```
Expected: all exit 0. `packages/config/dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(config): add zod-validated environment loading"
```

---

### Task 5: `@wintel/types` — the shared health contract

The first shared contract. It exists so the web app validates exactly what the API promises, with a single definition of the shape.

**Files:**
- Create: `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/types/tsconfig.build.json`, `packages/types/eslint.config.mjs`, `packages/types/vitest.config.ts`
- Create: `packages/types/src/health.ts`, `packages/types/src/index.ts`
- Test: `packages/types/src/health.test.ts`

**Interfaces:**
- Consumes: `@wintel/tsconfig`, `@wintel/eslint-config`, `zod`.
- Produces, exported from `@wintel/types`:
  - `type DependencyStatus = 'up' | 'down'`
  - `type OverallHealthStatus = 'ok' | 'degraded'`
  - `interface DependencyCheck { status: DependencyStatus; latencyMs: number; error?: string }`
  - `interface HealthCheckResponse { status: OverallHealthStatus; uptimeSeconds: number; version: string; checks: { database: DependencyCheck; redis: DependencyCheck } }`
  - `dependencyCheckSchema`, `healthCheckResponseSchema` (Zod schemas whose output matches the interfaces above)

- [ ] **Step 1: Create the package manifest and configs**

`packages/types/package.json`:
```json
{
  "name": "@wintel/types",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "eslint": "^9.30.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`packages/types/tsconfig.json`:
```json
{
  "extends": "@wintel/tsconfig/node-library.json",
  "include": ["src"]
}
```

`packages/types/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

`packages/types/eslint.config.mjs`:
```js
import base from '@wintel/eslint-config';

export default base;
```

`packages/types/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

Install:
```bash
pnpm install
```

- [ ] **Step 2: Write the failing test**

`packages/types/src/health.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { healthCheckResponseSchema } from './health';

const healthyPayload = {
  status: 'ok',
  uptimeSeconds: 42,
  version: '0.1.0',
  checks: {
    database: { status: 'up', latencyMs: 3 },
    redis: { status: 'up', latencyMs: 1 },
  },
};

describe('healthCheckResponseSchema', () => {
  it('accepts a healthy payload', () => {
    const result = healthCheckResponseSchema.safeParse(healthyPayload);

    expect(result.success).toBe(true);
  });

  it('accepts a degraded payload carrying an error string', () => {
    const result = healthCheckResponseSchema.safeParse({
      ...healthyPayload,
      status: 'degraded',
      checks: {
        database: { status: 'down', latencyMs: 2001, error: 'connection refused' },
        redis: { status: 'up', latencyMs: 1 },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown overall status', () => {
    const result = healthCheckResponseSchema.safeParse({ ...healthyPayload, status: 'fine' });

    expect(result.success).toBe(false);
  });

  it('rejects a payload missing a dependency check', () => {
    const result = healthCheckResponseSchema.safeParse({
      ...healthyPayload,
      checks: { database: { status: 'up', latencyMs: 3 } },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative latency', () => {
    const result = healthCheckResponseSchema.safeParse({
      ...healthyPayload,
      checks: {
        database: { status: 'up', latencyMs: -1 },
        redis: { status: 'up', latencyMs: 1 },
      },
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/types test
```
Expected: FAIL — `Failed to resolve import "./health"`.

- [ ] **Step 4: Implement the contract**

`packages/types/src/health.ts`:
```ts
import { z } from 'zod';

export const DEPENDENCY_STATUSES = ['up', 'down'] as const;
export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number];

export const OVERALL_HEALTH_STATUSES = ['ok', 'degraded'] as const;
export type OverallHealthStatus = (typeof OVERALL_HEALTH_STATUSES)[number];

export const dependencyCheckSchema = z.object({
  status: z.enum(DEPENDENCY_STATUSES),
  latencyMs: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export const healthCheckResponseSchema = z.object({
  status: z.enum(OVERALL_HEALTH_STATUSES),
  uptimeSeconds: z.number().int().nonnegative(),
  version: z.string().min(1),
  checks: z.object({
    database: dependencyCheckSchema,
    redis: dependencyCheckSchema,
  }),
});

export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;
export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;
```

The types are derived from the schemas rather than declared separately, so the runtime validation and the compile-time contract can never drift apart.

- [ ] **Step 5: Create the barrel**

`packages/types/src/index.ts`:
```ts
export {
  DEPENDENCY_STATUSES,
  OVERALL_HEALTH_STATUSES,
  dependencyCheckSchema,
  healthCheckResponseSchema,
} from './health';
export type {
  DependencyCheck,
  DependencyStatus,
  HealthCheckResponse,
  OverallHealthStatus,
} from './health';
```

- [ ] **Step 6: Run tests, build, lint, typecheck**

Run:
```bash
pnpm --filter @wintel/types test && pnpm --filter @wintel/types run build && pnpm --filter @wintel/types run lint && pnpm --filter @wintel/types run typecheck
```
Expected: 5 tests PASS, all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(types): add shared health check contract"
```

---

### Task 6: `@wintel/database` — Prisma schema, baseline migration, client factory

Proves the migration pipeline end to end — generate, apply, record — against real Postgres, before any product model exists to obscure a wiring failure.

**Files:**
- Create: `packages/database/package.json`, `packages/database/tsconfig.json`, `packages/database/tsconfig.build.json`, `packages/database/eslint.config.mjs`, `packages/database/vitest.config.ts`, `packages/database/test/setup-env.ts`
- Create: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/migration_lock.toml`, `packages/database/prisma/migrations/00000000000000_baseline/migration.sql`
- Create: `packages/database/src/create-client.ts`, `packages/database/src/index.ts`
- Test: `packages/database/src/create-client.test.ts`
- Modify: root `package.json` (add `db:*` scripts)

**Interfaces:**
- Consumes: `DATABASE_URL` from the root `.env`; `loadDotenv` from `@wintel/config`.
- Produces, exported from `@wintel/database`:
  - `PrismaClient` and `Prisma` re-exported from the generated client
  - `interface CreatePrismaClientOptions { databaseUrl: string; logQueries?: boolean }`
  - `function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient`

- [ ] **Step 1: Create the package manifest and configs**

`packages/database/package.json` — `build` runs `prisma generate` first, so `dependsOn: ["^build"]` in `turbo.json` is all any consumer needs to get a generated client.
```json
{
  "name": "@wintel/database",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "build": "pnpm run db:generate && tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist generated .turbo",
    "db:generate": "dotenv -e ../../.env -- prisma generate",
    "db:migrate": "dotenv -e ../../.env -- prisma migrate deploy",
    "db:migrate:dev": "dotenv -e ../../.env -- prisma migrate dev",
    "db:reset": "dotenv -e ../../.env -- prisma migrate reset --force",
    "db:studio": "dotenv -e ../../.env -- prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.11.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@wintel/config": "workspace:*",
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "dotenv-cli": "^8.0.0",
    "eslint": "^9.30.0",
    "prisma": "^6.11.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Every Prisma command is wrapped in `dotenv-cli` pointed at the monorepo root `.env`. The Prisma CLI only searches its own working directory, which in a workspace is `packages/database` — without this wrapper the commands would silently look in the wrong place. This makes the root `.env` a hard requirement; `cp .env.example .env` is already the second step in the README.

`packages/database/tsconfig.json`:
```json
{
  "extends": "@wintel/tsconfig/node-library.json",
  "include": ["src"]
}
```

`packages/database/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

`packages/database/eslint.config.mjs`:
```js
import base from '@wintel/eslint-config';

export default base;
```

`packages/database/test/setup-env.ts`:
```ts
import { loadDotenv } from '@wintel/config';

loadDotenv(['../../.env']);
```

`packages/database/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Integration tests share one Postgres database; running them in parallel across
    // processes would make the migration assertions racy.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
```

Install:
```bash
pnpm install
```

- [ ] **Step 2: Write the Prisma schema**

`packages/database/prisma/schema.prisma` — no models. The foundation slice ships none; the first models arrive with the auth slice.
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// No product models yet. The foundation slice exists to prove the pipeline:
// generate -> migrate -> connect. Models arrive with their feature slices.
```

- [ ] **Step 3: Write the baseline migration**

`packages/database/prisma/migrations/migration_lock.toml`:
```toml
provider = "postgresql"
```

`packages/database/prisma/migrations/00000000000000_baseline/migration.sql`:
```sql
-- Baseline migration.
--
-- The foundation slice ships no product models. This migration exists so the migration
-- pipeline is exercised end to end (applied, and recorded in _prisma_migrations) before
-- any real schema depends on it. Product models arrive with their feature slices.
SELECT 1;
```

- [ ] **Step 4: Generate the client and apply the migration**

Ensure `.env` exists and infrastructure is running:
```bash
cp -n .env.example .env; pnpm infra:up
```

Run:
```bash
pnpm --filter @wintel/database run db:generate
```
Expected: `Generated Prisma Client (v6.x.x) to ./generated/client`.

Run:
```bash
pnpm --filter @wintel/database run db:migrate
```
Expected output contains:
```
1 migration found in prisma/migrations
Applying migration `00000000000000_baseline`
```

Verify it was recorded:
```bash
docker exec wintel-postgres psql -U wintel -d wintel -c "SELECT migration_name FROM _prisma_migrations;"
```
Expected output includes `00000000000000_baseline`.

- [ ] **Step 5: Write the failing test for the client factory**

`packages/database/src/create-client.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from './create-client';
import type { PrismaClient } from './index';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the database integration tests.');
}

let client: PrismaClient | undefined;

afterEach(async () => {
  await client?.$disconnect();
  client = undefined;
});

describe('createPrismaClient', () => {
  it('connects to the configured database', async () => {
    client = createPrismaClient({ databaseUrl });

    const rows = await client.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;

    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('has applied the baseline migration', async () => {
    client = createPrismaClient({ databaseUrl });

    const rows = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;

    expect(rows.map((row) => row.migration_name)).toContain('00000000000000_baseline');
  });

  it('fails to connect when pointed at a database that does not exist', async () => {
    client = createPrismaClient({
      databaseUrl: 'postgresql://wintel:wintel@localhost:5433/does-not-exist?schema=public',
    });

    await expect(client.$queryRaw`SELECT 1`).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/database test
```
Expected: FAIL — `Failed to resolve import "./create-client"`.

- [ ] **Step 7: Implement the client factory and barrel**

`packages/database/src/create-client.ts`:
```ts
import { PrismaClient } from '../generated/client';

export interface CreatePrismaClientOptions {
  /** Full Postgres connection string. Passed explicitly so callers own their configuration. */
  databaseUrl: string;
  /** Log every SQL statement. Useful in local development, far too noisy in production. */
  logQueries?: boolean;
}

/**
 * Builds a PrismaClient.
 *
 * The connection string is injected rather than read from `process.env` inside this package,
 * so consumers (API, worker, tests, future CLIs) each keep a single validated source of
 * configuration and nothing reaches around them into the ambient environment.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  return new PrismaClient({
    datasourceUrl: options.databaseUrl,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
```

`packages/database/src/index.ts`:
```ts
export { Prisma, PrismaClient } from '../generated/client';
export { createPrismaClient } from './create-client';
export type { CreatePrismaClientOptions } from './create-client';
```

The generated client sits at `packages/database/generated/client`, one level above `src`. Because `dist` is also one level below the package root, the emitted `require('../generated/client')` resolves correctly from both `src` (during typecheck) and `dist` (at runtime). TypeScript raises no `rootDir` error because the generated client is reached through its `.d.ts` files, which are never re-emitted.

- [ ] **Step 8: Run the tests and confirm they pass**

Run:
```bash
pnpm --filter @wintel/database test
```
Expected: PASS, 3 tests.

- [ ] **Step 9: Add the database scripts to the root package.json**

Add to root `package.json` `scripts`:
```json
"db:generate": "pnpm --filter @wintel/database run db:generate",
"db:migrate": "pnpm --filter @wintel/database run db:migrate",
"db:migrate:dev": "pnpm --filter @wintel/database run db:migrate:dev",
"db:reset": "pnpm --filter @wintel/database run db:reset",
"db:studio": "pnpm --filter @wintel/database run db:studio"
```

Verify:
```bash
pnpm db:migrate
```
Expected: `No pending migrations to apply.`

- [ ] **Step 10: Build, lint, typecheck**

Run:
```bash
pnpm --filter @wintel/database run build && pnpm --filter @wintel/database run lint && pnpm --filter @wintel/database run typecheck
```
Expected: all exit 0.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(database): add prisma schema, baseline migration and client factory"
```

---

### Task 7: `@wintel/api` — NestJS application with a real health endpoint

The largest task, but a single cohesive deliverable: an API process that boots on validated config, logs structurally, shapes every error identically, and reports honestly on its own dependencies.

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json`, `apps/api/eslint.config.mjs`, `apps/api/vitest.config.ts`, `apps/api/.env.example`, `apps/api/test/setup-env.ts`
- Create: `apps/api/src/version.ts`, `apps/api/src/main.ts`, `apps/api/src/create-app.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/api-config.module.ts`
- Create: `apps/api/src/common/filters/all-exceptions.filter.ts`, `apps/api/src/common/pipes/zod-validation.pipe.ts`
- Create: `apps/api/src/infrastructure/prisma/prisma.service.ts`, `apps/api/src/infrastructure/prisma/prisma.module.ts`
- Create: `apps/api/src/infrastructure/redis/redis.service.ts`, `apps/api/src/infrastructure/redis/redis.module.ts`
- Create: `apps/api/src/modules/health/health.service.ts`, `apps/api/src/modules/health/health.controller.ts`, `apps/api/src/modules/health/health.module.ts`
- Test: `apps/api/src/common/pipes/zod-validation.pipe.test.ts`, `apps/api/src/common/filters/all-exceptions.filter.test.ts`, `apps/api/src/modules/health/health.service.test.ts`, `apps/api/test/api.e2e.test.ts`

**Interfaces:**
- Consumes: `loadDotenv`, `loadEnv`, `apiEnvSchema`, `EnvValidationError`, `type ApiEnv` from `@wintel/config`; `createPrismaClient`, `type PrismaClient` from `@wintel/database`; `type HealthCheckResponse`, `type DependencyCheck`, `healthCheckResponseSchema` from `@wintel/types`.
- Produces:
  - `const API_ENV: symbol` and `class ApiConfigModule { static forRoot(env: ApiEnv): DynamicModule }`
  - `class AppModule { static forEnv(env: ApiEnv): DynamicModule }`
  - `function createApiApp(env: ApiEnv): Promise<INestApplication>`
  - `class PrismaService { readonly client: PrismaClient }`
  - `class RedisService { readonly client: Redis }`
  - `class HealthService { check(): Promise<HealthCheckResponse> }`
  - `class ZodValidationPipe<TOutput> implements PipeTransform`
  - `function describeException(exception: unknown): { statusCode: number; message: string; details?: unknown }`
  - HTTP route `GET /api/v1/health`

- [ ] **Step 1: Create the package manifest**

`apps/api/package.json`:
```json
{
  "name": "@wintel/api",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.0",
    "@nestjs/core": "^11.1.0",
    "@nestjs/platform-express": "^11.1.0",
    "@wintel/config": "workspace:*",
    "@wintel/database": "workspace:*",
    "@wintel/types": "workspace:*",
    "ioredis": "^5.6.0",
    "nestjs-pino": "^4.4.0",
    "pino": "^9.7.0",
    "pino-http": "^10.5.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.1.0",
    "@swc/core": "^1.12.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.15.0",
    "@types/supertest": "^6.0.3",
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "eslint": "^9.30.0",
    "pino-pretty": "^13.0.0",
    "supertest": "^7.1.0",
    "typescript": "^5.8.0",
    "unplugin-swc": "^1.5.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create the TypeScript, Nest, ESLint and Vitest configs**

`apps/api/tsconfig.json` — used for typechecking, so it covers `test/` too; `rootDir` is the package root here precisely because tests live outside `src`.
```json
{
  "extends": "@wintel/tsconfig/nest.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`apps/api/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

`apps/api/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json"
  }
}
```

`apps/api/eslint.config.mjs`:
```js
import base from '@wintel/eslint-config';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS expresses DI and routing through decorators on classes whose members are
      // assigned by the framework; the base rule set assumes plain modules.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
```

`apps/api/test/setup-env.ts`:
```ts
import { loadDotenv } from '@wintel/config';

loadDotenv(['.env', '../../.env']);
```

`apps/api/vitest.config.ts` — the SWC plugin is required, not optional: Vitest transforms with esbuild, which does not implement `emitDecoratorMetadata`, so NestJS constructor injection by type would silently resolve to `undefined` without it.
```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.e2e.test.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // The e2e suite talks to the shared Postgres and Redis from docker compose.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
```

`apps/api/.env.example` — only API-specific values; `DATABASE_URL` and `REDIS_URL` are inherited from the root `.env`, because `loadDotenv` checks the app directory first and then the repo root without overriding anything already set.
```bash
NODE_ENV=development
LOG_LEVEL=debug
PORT=4000
CORS_ORIGINS=http://localhost:3000
```

Install:
```bash
pnpm install
```

- [ ] **Step 3: Write the failing unit test for the Zod validation pipe**

`apps/api/src/common/pipes/zod-validation.pipe.test.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(1),
  count: z.coerce.number().int().positive(),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed and transformed value', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ name: 'crawl', count: '3' })).toEqual({ name: 'crawl', count: 3 });
  });

  it('throws BadRequestException for an invalid value', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ name: '', count: 3 })).toThrow(BadRequestException);
  });

  it('reports every offending field in the exception details', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ name: '', count: -1 });
      expect.unreachable('pipe should have thrown');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        message: string;
        details: Array<{ path: string; message: string }>;
      };

      expect(response.message).toBe('Validation failed');
      expect(response.details.map((detail) => detail.path).sort()).toEqual(['count', 'name']);
    }
  });
});
```

- [ ] **Step 4: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/api test
```
Expected: FAIL — `Failed to resolve import "./zod-validation.pipe"`.

- [ ] **Step 5: Implement the Zod validation pipe**

`apps/api/src/common/pipes/zod-validation.pipe.ts`:
```ts
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request payload against a Zod schema.
 *
 * Applied per parameter rather than globally — `@Body(new ZodValidationPipe(createThingSchema))` —
 * because a global pipe has no way to know which schema belongs to which route, and this form
 * gives the handler a fully inferred parameter type for free.
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
```

- [ ] **Step 6: Run and confirm the pipe tests pass**

Run:
```bash
pnpm --filter @wintel/api test
```
Expected: PASS, 3 tests.

- [ ] **Step 7: Write the failing test for exception description**

`apps/api/src/common/filters/all-exceptions.filter.test.ts`:
```ts
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { describeException } from './all-exceptions.filter';

describe('describeException', () => {
  it('describes an HttpException carrying a string body', () => {
    const result = describeException(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT));

    expect(result).toEqual({ statusCode: 418, message: 'Teapot' });
  });

  it('describes an HttpException carrying an object body with details', () => {
    const exception = new BadRequestException({
      message: 'Validation failed',
      details: [{ path: 'name', message: 'Required' }],
    });

    const result = describeException(exception);

    expect(result.statusCode).toBe(400);
    expect(result.message).toBe('Validation failed');
    expect(result.details).toEqual([{ path: 'name', message: 'Required' }]);
  });

  it('joins an array message into a single string', () => {
    const result = describeException(new BadRequestException(['too short', 'not a url']));

    expect(result.message).toBe('too short; not a url');
  });

  it('never leaks the message of a non-HTTP exception', () => {
    const result = describeException(new Error('connection string is postgres://user:hunter2@db'));

    expect(result).toEqual({ statusCode: 500, message: 'Internal server error' });
  });
});
```

- [ ] **Step 8: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/api test
```
Expected: FAIL — `Failed to resolve import "./all-exceptions.filter"`.

- [ ] **Step 9: Implement the exception filter**

`apps/api/src/common/filters/all-exceptions.filter.ts`:
```ts
import { STATUS_CODES } from 'node:http';

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

interface ExceptionDescription {
  statusCode: number;
  message: string;
  details?: unknown;
}

/**
 * Reduces any thrown value to a client-safe status, message and optional details.
 *
 * Non-HTTP exceptions are deliberately flattened to a generic 500 message: an unexpected error
 * can carry connection strings, tokens, or query fragments, and none of that belongs in a
 * response body. The real error still reaches the logs.
 */
export function describeException(exception: unknown): ExceptionDescription {
  if (!(exception instanceof HttpException)) {
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }

  const statusCode = exception.getStatus();
  const body = exception.getResponse();

  if (typeof body === 'string') {
    return { statusCode, message: body };
  }

  const record = body as Record<string, unknown>;
  const rawMessage = record.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join('; ')
    : typeof rawMessage === 'string'
      ? rawMessage
      : exception.message;

  return record.details === undefined
    ? { statusCode, message }
    : { statusCode, message, details: record.details };
}

/** Gives every error leaving the API one shape, and every 5xx one log line. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();

    const { statusCode, message, details } = describeException(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId: request.id, path: request.url },
        'Unhandled exception',
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      ...(request.id === undefined ? {} : { requestId: request.id }),
      ...(details === undefined ? {} : { details }),
    };

    response.status(statusCode).json(body);
  }
}
```

- [ ] **Step 10: Run and confirm the filter tests pass**

Run:
```bash
pnpm --filter @wintel/api test
```
Expected: PASS, 7 tests.

- [ ] **Step 11: Implement the config module and infrastructure modules**

`apps/api/src/config/api-config.module.ts`:
```ts
import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';

/** Injection token for the validated API environment. */
export const API_ENV = Symbol('API_ENV');

/**
 * Makes the already-validated environment injectable.
 *
 * Validation happens once, at process start, before Nest is constructed — so by the time any
 * provider receives `API_ENV` the configuration is known good and fully typed. No provider
 * reads `process.env` directly.
 */
@Global()
@Module({})
export class ApiConfigModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: ApiConfigModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
```

`apps/api/src/infrastructure/prisma/prisma.service.ts`:
```ts
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import { createPrismaClient, type PrismaClient } from '@wintel/database';

import { API_ENV } from '../../config/api-config.module';

/**
 * Owns the Prisma client lifecycle.
 *
 * Composition rather than `extends PrismaClient`: the service is free to grow transaction
 * helpers and instrumentation without those leaking onto the client's own surface, and
 * consumers depend on this class rather than on Prisma directly.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = createPrismaClient({
      databaseUrl: env.DATABASE_URL,
      logQueries: env.NODE_ENV === 'development',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
```

`apps/api/src/infrastructure/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`apps/api/src/infrastructure/redis/redis.service.ts`:
```ts
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { API_ENV } from '../../config/api-config.module';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger,
  ) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

    // ioredis emits 'error' on every failed reconnection attempt. An unhandled 'error' event
    // on an EventEmitter terminates the process, so a transient Redis blip would take the whole
    // API down. Log it instead and let the health endpoint report the degradation.
    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Redis connection error');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
```

`apps/api/src/infrastructure/redis/redis.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 12: Write the failing unit test for the health service**

`apps/api/src/modules/health/health.service.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

import { HealthService } from './health.service';

function buildService(options: { databaseFails?: boolean; redisFails?: boolean } = {}) {
  const prisma = {
    client: {
      $queryRaw: vi.fn(() =>
        options.databaseFails
          ? Promise.reject(new Error('connection refused'))
          : Promise.resolve([{ ok: 1 }]),
      ),
    },
  };
  const redis = {
    client: {
      ping: vi.fn(() =>
        options.redisFails ? Promise.reject(new Error('LOADING')) : Promise.resolve('PONG'),
      ),
    },
  };

  return new HealthService(
    prisma as unknown as ConstructorParameters<typeof HealthService>[0],
    redis as unknown as ConstructorParameters<typeof HealthService>[1],
  );
}

describe('HealthService', () => {
  it('reports ok when every dependency answers', async () => {
    const result = await buildService().check();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.redis.status).toBe('up');
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports degraded and names the failing dependency when the database is down', async () => {
    const result = await buildService({ databaseFails: true }).check();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('down');
    expect(result.checks.database.error).toBe('connection refused');
    expect(result.checks.redis.status).toBe('up');
  });

  it('reports degraded when Redis is down', async () => {
    const result = await buildService({ redisFails: true }).check();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis.status).toBe('down');
  });

  it('probes dependencies concurrently rather than in sequence', async () => {
    const service = buildService({ databaseFails: true });

    const result = await service.check();

    // Both probes must still have run even though the first one rejected.
    expect(result.checks.redis.status).toBe('up');
  });
});
```

- [ ] **Step 13: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/api test
```
Expected: FAIL — `Failed to resolve import "./health.service"`.

- [ ] **Step 14: Implement the version constant, health service, controller and module**

`apps/api/src/version.ts`:
```ts
/**
 * Reported by the health endpoint. Mirrors the `version` field of `apps/api/package.json`;
 * kept as a constant so the compiled output never has to read a file relative to `dist`.
 */
export const APP_VERSION = '0.1.0';
```

`apps/api/src/modules/health/health.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { DependencyCheck, HealthCheckResponse } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { APP_VERSION } from '../../version';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Probes every dependency concurrently and reports each one individually.
   *
   * A single boolean would tell an operator that something is wrong but not what; naming the
   * failing dependency and its latency is the difference between a page and a fix.
   */
  async check(): Promise<HealthCheckResponse> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.prisma.client.$queryRaw`SELECT 1`),
      this.probe(() => this.redis.client.ping()),
    ]);

    return {
      status: database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      version: APP_VERSION,
      checks: { database, redis },
    };
  }

  private async probe(run: () => Promise<unknown>): Promise<DependencyCheck> {
    const startedAt = Date.now();

    try {
      await run();
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
```

`apps/api/src/modules/health/health.controller.ts`:
```ts
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthCheckResponse } from '@wintel/types';
import type { Response } from 'express';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Returns 200 when healthy and 503 when degraded, so load balancers and uptime checks can
   * act on the status code while humans read the body.
   */
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthCheckResponse> {
    const result = await this.health.check();

    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return result;
  }
}
```

`apps/api/src/modules/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
```

This trio is the template every future feature module follows: a module that declares its own controllers and providers, a controller that does nothing but translate HTTP to a service call, and a service that holds the logic.

- [ ] **Step 15: Run and confirm the health service tests pass**

Run:
```bash
pnpm --filter @wintel/api test
```
Expected: PASS, 11 tests.

- [ ] **Step 16: Implement the application module and factory**

`apps/api/src/app.module.ts`:
```ts
import { randomUUID } from 'node:crypto';

import { type DynamicModule, Module } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiConfigModule } from './config/api-config.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { HealthModule } from './modules/health/health.module';

@Module({})
export class AppModule {
  static forEnv(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ApiConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            genReqId: (request, response) => {
              const incoming = request.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
              response.setHeader('x-request-id', id);
              return id;
            },
            // Uptime checks poll this endpoint constantly; logging every hit buries real traffic.
            autoLogging: { ignore: (request) => request.url === '/api/v1/health' },
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]'],
              remove: true,
            },
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
                : undefined,
          },
        }),
        PrismaModule,
        RedisModule,
        HealthModule,
      ],
      providers: [AllExceptionsFilter],
    };
  }
}
```

`apps/api/src/create-app.ts` — shared by `main.ts` and the e2e suite, so the tests exercise the same wiring production runs.
```ts
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ApiEnv } from '@wintel/config';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export async function createApiApp(env: ApiEnv): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forEnv(env), { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  // Lets Nest run onModuleDestroy on SIGTERM so Prisma and Redis close cleanly on deploy.
  app.enableShutdownHooks();

  return app;
}
```

`apps/api/src/main.ts`:
```ts
import 'reflect-metadata';

import { apiEnvSchema, EnvValidationError, loadDotenv, loadEnv } from '@wintel/config';

import { createApiApp } from './create-app';

async function bootstrap(): Promise<void> {
  loadDotenv(['.env', '../../.env']);

  const env = loadEnv(apiEnvSchema);
  const app = await createApiApp(env);

  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  // Configuration errors are the operator's problem and already carry a complete message;
  // anything else is a genuine crash and deserves the full stack.
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('API failed to start', error);
  }

  process.exit(1);
});
```

- [ ] **Step 17: Write the failing end-to-end test**

`apps/api/test/api.e2e.test.ts`:
```ts
import type { INestApplication } from '@nestjs/common';
import { apiEnvSchema, loadEnv } from '@wintel/config';
import { healthCheckResponseSchema } from '@wintel/types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp } from '../src/create-app';

let app: INestApplication;

beforeAll(async () => {
  const env = loadEnv(apiEnvSchema, { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'error' });
  app = await createApiApp(env);
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/health', () => {
  it('returns 200 with every dependency up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('returns a body matching the shared health contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    const parsed = healthCheckResponseSchema.safeParse(response.body);

    expect(parsed.success).toBe(true);
  });

  it('echoes a request id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'test-request-id');

    expect(response.headers['x-request-id']).toBe('test-request-id');
  });
});

describe('error shaping', () => {
  it('returns the standard error body for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    expect(typeof response.body.requestId).toBe('string');
  });

  it('serves routes only under the version prefix', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 18: Run the full API suite**

Ensure infrastructure is up:
```bash
pnpm infra:up
```

Run:
```bash
pnpm --filter @wintel/api test
```
Expected: PASS, 16 tests.

- [ ] **Step 19: Verify the API actually boots and serves**

Run:
```bash
pnpm --filter @wintel/api run build && pnpm --filter @wintel/api run start &
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/v1/health
curl -s http://localhost:4000/api/v1/health
```
Expected: `200`, then a JSON body with `"status":"ok"` and both checks `"up"`.

Stop the background process:
```bash
kill %1
```

- [ ] **Step 20: Lint and typecheck**

Run:
```bash
pnpm --filter @wintel/api run lint && pnpm --filter @wintel/api run typecheck
```
Expected: both exit 0.

- [ ] **Step 21: Commit**

```bash
git add -A
git commit -m "feat(api): add nestjs application with health endpoint and error shaping"
```

---

### Task 8: `@wintel/worker` — NestJS standalone BullMQ worker

Proves the background-job pipeline works before any real job depends on it: enqueue, process, observe the effect, shut down cleanly.

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/tsconfig.build.json`, `apps/worker/nest-cli.json`, `apps/worker/eslint.config.mjs`, `apps/worker/vitest.config.ts`, `apps/worker/.env.example`, `apps/worker/test/setup-env.ts`
- Create: `apps/worker/src/main.ts`, `apps/worker/src/create-worker.ts`, `apps/worker/src/worker.module.ts`
- Create: `apps/worker/src/config/worker-config.module.ts`
- Create: `apps/worker/src/infrastructure/redis/redis.service.ts`, `apps/worker/src/infrastructure/redis/redis.module.ts`
- Create: `apps/worker/src/queues/example/example.constants.ts`, `apps/worker/src/queues/example/example.processor.ts`, `apps/worker/src/queues/example/example.module.ts`
- Test: `apps/worker/test/example-queue.e2e.test.ts`

**Interfaces:**
- Consumes: `loadDotenv`, `loadEnv`, `workerEnvSchema`, `EnvValidationError`, `type WorkerEnv` from `@wintel/config`.
- Produces:
  - `const WORKER_ENV: symbol`, `class WorkerConfigModule { static forRoot(env: WorkerEnv): DynamicModule }`
  - `class WorkerModule { static forEnv(env: WorkerEnv): DynamicModule }`
  - `function createWorkerApp(env: WorkerEnv): Promise<INestApplicationContext>`
  - `const EXAMPLE_QUEUE = 'example'`, `interface ExampleJobData { message: string }`, `function exampleResultKey(jobId: string): string`
  - `class ExampleProcessor extends WorkerHost`

- [ ] **Step 1: Create the package manifest and configs**

`apps/worker/package.json`:
```json
{
  "name": "@wintel/worker",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "@nestjs/bullmq": "^11.0.0",
    "@nestjs/common": "^11.1.0",
    "@nestjs/core": "^11.1.0",
    "@wintel/config": "workspace:*",
    "@wintel/database": "workspace:*",
    "bullmq": "^5.56.0",
    "ioredis": "^5.6.0",
    "nestjs-pino": "^4.4.0",
    "pino": "^9.7.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.1.0",
    "@swc/core": "^1.12.0",
    "@types/node": "^22.15.0",
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "eslint": "^9.30.0",
    "pino-pretty": "^13.0.0",
    "typescript": "^5.8.0",
    "unplugin-swc": "^1.5.0",
    "vitest": "^3.2.0"
  }
}
```

`apps/worker/tsconfig.json`:
```json
{
  "extends": "@wintel/tsconfig/nest.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`apps/worker/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

`apps/worker/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json"
  }
}
```

`apps/worker/eslint.config.mjs`:
```js
import base from '@wintel/eslint-config';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
```

`apps/worker/test/setup-env.ts`:
```ts
import { loadDotenv } from '@wintel/config';

loadDotenv(['.env', '../../.env']);
```

`apps/worker/vitest.config.ts`:
```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.e2e.test.ts'],
    setupFiles: ['./test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
```

`apps/worker/.env.example`:
```bash
NODE_ENV=development
LOG_LEVEL=debug
WORKER_CONCURRENCY=5
```

Install:
```bash
pnpm install
```

- [ ] **Step 2: Write the failing end-to-end test for the example queue**

`apps/worker/test/example-queue.e2e.test.ts`:
```ts
import type { INestApplicationContext } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { loadEnv, workerEnvSchema } from '@wintel/config';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createWorkerApp } from '../src/create-worker';
import {
  EXAMPLE_QUEUE,
  type ExampleJobData,
  exampleResultKey,
} from '../src/queues/example/example.constants';
import { RedisService } from '../src/infrastructure/redis/redis.service';

let app: INestApplicationContext;
let queue: Queue<ExampleJobData>;
let redis: RedisService;

beforeAll(async () => {
  const env = loadEnv(workerEnvSchema, { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'error' });
  app = await createWorkerApp(env);
  await app.init();

  queue = app.get<Queue<ExampleJobData>>(getQueueToken(EXAMPLE_QUEUE));
  redis = app.get(RedisService);

  await queue.drain();
});

afterAll(async () => {
  await app.close();
});

describe('example queue', () => {
  it('processes an enqueued job and records the result in redis', async () => {
    const job = await queue.add('greet', { message: 'foundation works' });

    expect(job.id).toBeDefined();

    const stored = await vi.waitFor(
      async () => {
        const value = await redis.client.get(exampleResultKey(job.id as string));
        if (value === null) {
          throw new Error('result not written yet');
        }
        return value;
      },
      { timeout: 15_000, interval: 100 },
    );

    expect(JSON.parse(stored)).toMatchObject({ message: 'foundation works' });
  });

  it('reports the job as completed', async () => {
    const job = await queue.add('greet', { message: 'second job' });

    await vi.waitFor(
      async () => {
        const state = await job.getState();
        if (state !== 'completed') {
          throw new Error(`job is ${state}`);
        }
      },
      { timeout: 15_000, interval: 100 },
    );

    const state = await job.getState();

    expect(state).toBe('completed');
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/worker test
```
Expected: FAIL — `Failed to resolve import "../src/create-worker"`.

- [ ] **Step 4: Implement the config and Redis modules**

`apps/worker/src/config/worker-config.module.ts`:
```ts
import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';

export const WORKER_ENV = Symbol('WORKER_ENV');

@Global()
@Module({})
export class WorkerConfigModule {
  static forRoot(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerConfigModule,
      providers: [{ provide: WORKER_ENV, useValue: env }],
      exports: [WORKER_ENV],
    };
  }
}
```

`apps/worker/src/infrastructure/redis/redis.service.ts` — this is a general-purpose client for the worker's own reads and writes; BullMQ maintains its own connections through `BullModule`.
```ts
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WORKER_ENV } from '../../config/worker-config.module';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(
    @Inject(WORKER_ENV) env: WorkerEnv,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger,
  ) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Redis connection error');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
```

`apps/worker/src/infrastructure/redis/redis.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 5: Implement the example queue**

`apps/worker/src/queues/example/example.constants.ts`:
```ts
/** Name of the placeholder queue proving the job pipeline. Replaced by real queues per slice. */
export const EXAMPLE_QUEUE = 'example';

export interface ExampleJobData {
  message: string;
}

export interface ExampleJobResult {
  message: string;
  processedAt: string;
}

/** Redis key holding a processed job's result, so a caller can observe the effect of a job. */
export function exampleResultKey(jobId: string): string {
  return `example:result:${jobId}`;
}

/** Results are a debugging aid, not durable state — five minutes is plenty. */
export const EXAMPLE_RESULT_TTL_SECONDS = 300;
```

`apps/worker/src/queues/example/example.processor.ts`:
```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  EXAMPLE_QUEUE,
  EXAMPLE_RESULT_TTL_SECONDS,
  type ExampleJobData,
  type ExampleJobResult,
  exampleResultKey,
} from './example.constants';

/**
 * Placeholder processor. It exists so the enqueue-process-observe path is exercised by a test
 * before a real queue (crawl, audit, report) depends on it. Delete it once one exists.
 */
@Processor(EXAMPLE_QUEUE)
export class ExampleProcessor extends WorkerHost {
  constructor(
    private readonly redis: RedisService,
    @InjectPinoLogger(ExampleProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job<ExampleJobData>): Promise<ExampleJobResult> {
    const result: ExampleJobResult = {
      message: job.data.message,
      processedAt: new Date().toISOString(),
    };

    await this.redis.client.set(
      exampleResultKey(String(job.id)),
      JSON.stringify(result),
      'EX',
      EXAMPLE_RESULT_TTL_SECONDS,
    );

    this.logger.info({ jobId: job.id }, 'Processed example job');

    return result;
  }
}
```

`apps/worker/src/queues/example/example.module.ts`:
```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ExampleProcessor } from './example.processor';
import { EXAMPLE_QUEUE } from './example.constants';

@Module({
  imports: [BullModule.registerQueue({ name: EXAMPLE_QUEUE })],
  providers: [ExampleProcessor],
  exports: [BullModule],
})
export class ExampleModule {}
```

- [ ] **Step 6: Implement the worker module and factory**

`apps/worker/src/worker.module.ts`:
```ts
import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import { LoggerModule } from 'nestjs-pino';

import { WorkerConfigModule } from './config/worker-config.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { ExampleModule } from './queues/example/example.module';

@Module({})
export class WorkerModule {
  static forEnv(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        WorkerConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
                : undefined,
          },
        }),
        BullModule.forRoot({
          connection: {
            url: env.REDIS_URL,
            // BullMQ blocks on Redis commands and requires retries to be unlimited; any other
            // value makes long-lived workers throw during normal blocking reads.
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 3_600, count: 1_000 },
            removeOnFail: { age: 24 * 3_600 },
          },
        }),
        RedisModule,
        ExampleModule,
      ],
    };
  }
}
```

`apps/worker/src/create-worker.ts`:
```ts
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { WorkerEnv } from '@wintel/config';
import { Logger } from 'nestjs-pino';

import { WorkerModule } from './worker.module';

/**
 * Builds the worker as a standalone application context: it consumes jobs and serves no HTTP.
 * Shared by `main.ts` and the e2e suite so tests exercise production wiring.
 */
export async function createWorkerApp(env: WorkerEnv): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(WorkerModule.forEnv(env), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  // On SIGTERM Nest destroys modules, which closes the BullMQ workers. BullMQ finishes the job
  // it is holding before closing, so a deploy never abandons work mid-flight.
  app.enableShutdownHooks();

  return app;
}
```

`apps/worker/src/main.ts`:
```ts
import 'reflect-metadata';

import { EnvValidationError, loadDotenv, loadEnv, workerEnvSchema } from '@wintel/config';

import { createWorkerApp } from './create-worker';

async function bootstrap(): Promise<void> {
  loadDotenv(['.env', '../../.env']);

  const env = loadEnv(workerEnvSchema);
  const app = await createWorkerApp(env);

  await app.init();
}

bootstrap().catch((error: unknown) => {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('Worker failed to start', error);
  }

  process.exit(1);
});
```

- [ ] **Step 7: Run the worker test suite**

Ensure infrastructure is up:
```bash
pnpm infra:up
```

Run:
```bash
pnpm --filter @wintel/worker test
```
Expected: PASS, 2 tests.

- [ ] **Step 8: Verify the worker boots and shuts down cleanly**

Run:
```bash
pnpm --filter @wintel/worker run build && pnpm --filter @wintel/worker run start &
sleep 5
kill -TERM %1
wait %1
```
Expected: the process starts without error, and exits within a couple of seconds of `SIGTERM` rather than hanging.

- [ ] **Step 9: Lint and typecheck**

Run:
```bash
pnpm --filter @wintel/worker run lint && pnpm --filter @wintel/worker run typecheck
```
Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(worker): add standalone bullmq worker with example queue"
```

---

### Task 9: `@wintel/ui` — shared React components

A source-only package. Next.js transpiles it directly, which keeps `"use client"` directives intact and removes a build step that only one consumer would ever benefit from.

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/eslint.config.mjs`, `packages/ui/vitest.config.ts`, `packages/ui/components.json`, `packages/ui/test/setup.ts`
- Create: `packages/ui/src/lib/utils.ts`, `packages/ui/src/components/button.tsx`, `packages/ui/src/components/badge.tsx`, `packages/ui/src/index.ts`
- Test: `packages/ui/src/lib/utils.test.ts`, `packages/ui/src/components/button.test.tsx`, `packages/ui/src/components/badge.test.tsx`

**Interfaces:**
- Consumes: `@wintel/tsconfig/react-library.json`, `@wintel/eslint-config/react`.
- Produces, exported from `@wintel/ui`:
  - `function cn(...inputs: ClassValue[]): string`
  - `function Button(props: ButtonProps): JSX.Element` where `ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>` and adds `variant?: 'default'|'outline'|'ghost'|'destructive'`, `size?: 'default'|'sm'|'lg'|'icon'`, `asChild?: boolean`
  - `function Badge(props: BadgeProps): JSX.Element` where `BadgeProps extends React.HTMLAttributes<HTMLSpanElement>` and adds `variant?: 'default'|'success'|'destructive'|'outline'`
  - `buttonVariants`, `badgeVariants`

- [ ] **Step 1: Create the package manifest and configs**

`packages/ui/package.json` — no `build` script on purpose; there is nothing to compile.
```json
{
  "name": "@wintel/ui",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf .turbo"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.2.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.6.0",
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "eslint": "^9.30.0",
    "jsdom": "^26.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`packages/ui/tsconfig.json`:
```json
{
  "extends": "@wintel/tsconfig/react-library.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/ui/eslint.config.mjs`:
```js
import react from '@wintel/eslint-config/react';

export default react;
```

`packages/ui/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`packages/ui/vitest.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
```

`packages/ui/components.json` — lets `pnpm dlx shadcn@latest add <component>` run from this directory drop new components into the right place with the right import aliases.
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "../../apps/web/src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

Install:
```bash
pnpm install
```

- [ ] **Step 2: Write the failing test for `cn`**

`packages/ui/src/lib/utils.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('lets a later tailwind class win over an earlier conflicting one', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/ui test
```
Expected: FAIL — `Failed to resolve import "./utils"`.

- [ ] **Step 4: Implement `cn`**

`packages/ui/src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, letting later Tailwind utilities override earlier conflicting ones.
 * Without the merge step, `cn('px-2', 'px-4')` would emit both and leave the winner to
 * stylesheet order, which callers cannot reason about.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run and confirm the `cn` tests pass**

Run:
```bash
pnpm --filter @wintel/ui test
```
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the failing component tests**

`packages/ui/src/components/button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders its children inside a button element', () => {
    render(<Button>Run scan</Button>);

    expect(screen.getByRole('button', { name: 'Run scan' })).toBeInTheDocument();
  });

  it('merges a caller-supplied class name with the variant classes', () => {
    render(<Button className="w-full">Run scan</Button>);

    expect(screen.getByRole('button')).toHaveClass('w-full');
  });

  it('renders as the child element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/scans">View scans</a>
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'View scans' })).toBeInTheDocument();
  });

  it('forwards the disabled attribute', () => {
    render(<Button disabled>Run scan</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

`packages/ui/src/components/badge.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>up</Badge>);

    expect(screen.getByText('up')).toBeInTheDocument();
  });

  it('applies a distinct class for the destructive variant', () => {
    const { rerender } = render(<Badge variant="success">up</Badge>);
    const successClass = screen.getByText('up').className;

    rerender(<Badge variant="destructive">down</Badge>);
    const destructiveClass = screen.getByText('down').className;

    expect(successClass).not.toBe(destructiveClass);
  });
});
```

- [ ] **Step 7: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/ui test
```
Expected: FAIL — cannot resolve `./button` and `./badge`.

- [ ] **Step 8: Implement the components**

`packages/ui/src/components/button.tsx`:
```tsx
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3',
        lg: 'h-10 rounded-md px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `button`, keeping the styling. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
```

`packages/ui/src/components/badge.tsx`:
```tsx
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
```

`packages/ui/src/index.ts`:
```ts
export { Badge, badgeVariants } from './components/badge';
export type { BadgeProps } from './components/badge';
export { Button, buttonVariants } from './components/button';
export type { ButtonProps } from './components/button';
export { cn } from './lib/utils';
```

- [ ] **Step 9: Run tests, lint and typecheck**

Run:
```bash
pnpm --filter @wintel/ui test && pnpm --filter @wintel/ui run lint && pnpm --filter @wintel/ui run typecheck
```
Expected: 9 tests PASS, all commands exit 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(ui): add shared button and badge components"
```

---

### Task 10: `@wintel/web` — Next.js dashboard showing live API health

Closes the loop: a browser page that fetches the API through TanStack Query, validates the response against the shared contract, and renders it with shared components.

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/eslint.config.mjs`, `apps/web/vitest.config.ts`, `apps/web/.env.example`, `apps/web/test/setup.ts`
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/lib/api-client.ts`, `apps/web/src/components/health-status.tsx`
- Test: `apps/web/src/lib/api-client.test.ts`, `apps/web/src/components/health-status.test.tsx`

**Interfaces:**
- Consumes: `healthCheckResponseSchema`, `type HealthCheckResponse` from `@wintel/types`; `Badge`, `Button`, `cn` from `@wintel/ui`.
- Produces:
  - `class ApiError extends Error { readonly status: number }`
  - `function fetchHealth(signal?: AbortSignal): Promise<HealthCheckResponse>`
  - `function Providers({ children }: { children: ReactNode }): JSX.Element`
  - `function HealthStatus(): JSX.Element`
  - Route `/` rendering `HealthStatus`

- [ ] **Step 1: Create the package manifest**

`apps/web/package.json`:
```json
{
  "name": "@wintel/web",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "build": "next build",
    "dev": "next dev --port 3000",
    "start": "next start --port 3000",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf .next .turbo"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.81.0",
    "@wintel/types": "workspace:*",
    "@wintel/ui": "workspace:*",
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.0",
    "@tailwindcss/postcss": "^4.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.6.0",
    "@wintel/eslint-config": "workspace:*",
    "@wintel/tsconfig": "workspace:*",
    "eslint": "^9.30.0",
    "eslint-config-next": "^15.3.0",
    "jsdom": "^26.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create the framework and tooling configs**

`apps/web/tsconfig.json`:
```json
{
  "extends": "@wintel/tsconfig/next.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src", "test", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts` — `transpilePackages` is what makes the source-only `@wintel/ui` package work.
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wintel/ui'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
```

`apps/web/postcss.config.mjs`:
```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

`apps/web/eslint.config.mjs` — `eslint-config-next` is still distributed as an eslintrc-style config, so it is bridged with `FlatCompat`.
```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import react from '@wintel/eslint-config/react';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...react,
  ...compat.extends('next/core-web-vitals'),
];
```

`apps/web/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`apps/web/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
```

`apps/web/.env.example`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Install:
```bash
pnpm install
```

- [ ] **Step 3: Write the failing test for the API client**

`apps/web/src/lib/api-client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, fetchHealth } from './api-client';

const healthyBody = {
  status: 'ok',
  uptimeSeconds: 12,
  version: '0.1.0',
  checks: {
    database: { status: 'up', latencyMs: 2 },
    redis: { status: 'up', latencyMs: 1 },
  },
};

function mockFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('returns the parsed health response', async () => {
    mockFetch(healthyBody);

    await expect(fetchHealth()).resolves.toEqual(healthyBody);
  });

  it('returns the body of a 503 degraded response rather than throwing', async () => {
    const degradedBody = {
      ...healthyBody,
      status: 'degraded',
      checks: {
        database: { status: 'down', latencyMs: 2000, error: 'connection refused' },
        redis: { status: 'up', latencyMs: 1 },
      },
    };
    mockFetch(degradedBody, 503);

    const result = await fetchHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.error).toBe('connection refused');
  });

  it('throws ApiError when the body does not match the shared contract', async () => {
    mockFetch({ status: 'fine' }, 200);

    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError when the response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>502</html>', { status: 502 }))),
    );

    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 4: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/web test
```
Expected: FAIL — `Failed to resolve import "./api-client"`.

- [ ] **Step 5: Implement the API client**

`apps/web/src/lib/api-client.ts`:
```ts
import { type HealthCheckResponse, healthCheckResponseSchema } from '@wintel/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Fetches API health.
 *
 * A degraded API answers 503 with a perfectly valid body, so the status code is deliberately
 * not treated as failure — only a body that does not match the shared contract is. That keeps
 * "the API is unhealthy" and "we cannot talk to the API" as two distinct outcomes in the UI.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/health`, { signal, cache: 'no-store' });
  const body: unknown = await response.json().catch(() => null);

  const parsed = healthCheckResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError('The API returned a response that does not match the health contract.', response.status);
  }

  return parsed.data;
}
```

- [ ] **Step 6: Run and confirm the API client tests pass**

Run:
```bash
pnpm --filter @wintel/web test
```
Expected: PASS, 4 tests.

- [ ] **Step 7: Write the failing test for the health status component**

`apps/web/src/components/health-status.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HealthStatus } from './health-status';

const healthyBody = {
  status: 'ok',
  uptimeSeconds: 12,
  version: '0.1.0',
  checks: {
    database: { status: 'up', latencyMs: 2 },
    redis: { status: 'up', latencyMs: 1 },
  },
};

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthStatus', () => {
  it('renders every dependency once the request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(healthyBody), { status: 200 }))),
    );

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
  });

  it('renders an unreachable state when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('fetch failed'))),
    );

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('Unreachable')).toBeInTheDocument();
  });

  it('renders a degraded state and surfaces the dependency error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...healthyBody,
              status: 'degraded',
              checks: {
                database: { status: 'down', latencyMs: 2000, error: 'connection refused' },
                redis: { status: 'up', latencyMs: 1 },
              },
            }),
            { status: 503 },
          ),
        ),
      ),
    );

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('connection refused')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run and confirm failure**

Run:
```bash
pnpm --filter @wintel/web test
```
Expected: FAIL — `Failed to resolve import "./health-status"`.

- [ ] **Step 9: Implement the providers and the health status component**

`apps/web/src/app/providers.tsx`:
```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  // Created inside state so each browser session gets exactly one client, and server rendering
  // never shares a cache between requests.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

`apps/web/src/components/health-status.tsx`:
```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import type { DependencyCheck } from '@wintel/types';
import { Badge } from '@wintel/ui';

import { fetchHealth } from '@/lib/api-client';

const DEPENDENCY_LABELS = {
  database: 'Database',
  redis: 'Redis',
} as const;

function DependencyRow({ label, check }: { label: string; check: DependencyCheck }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {check.error === undefined ? null : (
          <span className="text-xs text-destructive">{check.error}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{check.latencyMs} ms</span>
        <Badge variant={check.status === 'up' ? 'success' : 'destructive'}>{check.status}</Badge>
      </div>
    </li>
  );
}

export function HealthStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 10_000,
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Checking API…</p>;
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3">
        <Badge variant="destructive">Unreachable</Badge>
        <p className="text-sm text-muted-foreground">
          The API did not respond. Is it running on the configured address?
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge variant={data.status === 'ok' ? 'success' : 'destructive'}>
          {data.status === 'ok' ? 'Operational' : 'Degraded'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          v{data.version} · up {data.uptimeSeconds}s
        </span>
      </div>

      <ul className="rounded-lg border border-border px-4">
        {(Object.keys(DEPENDENCY_LABELS) as Array<keyof typeof DEPENDENCY_LABELS>).map((key) => (
          <DependencyRow key={key} label={DEPENDENCY_LABELS[key]} check={data.checks[key]} />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 10: Create the stylesheet, layout and page**

`apps/web/src/app/globals.css`:
```css
@import 'tailwindcss';

/* Tailwind v4 scans the project that imports it. The shared component package lives outside
   this app, so its sources must be registered explicitly or its classes get tree-shaken away. */
@source '../../../../packages/ui/src';

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --success: oklch(0.596 0.145 163.225);
  --success-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --success: oklch(0.696 0.17 162.48);
  --success-foreground: oklch(0.145 0 0);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-md: var(--radius);
}

@layer base {
  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

`apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'Website Intelligence Platform',
  description: 'Continuous website monitoring, auditing, and AI-assisted remediation.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:
```tsx
import { HealthStatus } from '@/components/health-status';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Website Intelligence Platform</h1>
        <p className="text-sm text-muted-foreground">
          Foundation slice. This page reports live API health; product features arrive with the
          next slices.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Platform status
        </h2>
        <HealthStatus />
      </section>
    </main>
  );
}
```

- [ ] **Step 11: Run the web test suite**

Run:
```bash
pnpm --filter @wintel/web test
```
Expected: PASS, 7 tests.

- [ ] **Step 12: Build the app and verify it renders against the running API**

Ensure infrastructure and API are running:
```bash
pnpm infra:up
pnpm --filter @wintel/api run start &
```

Run:
```bash
pnpm --filter @wintel/web run build
```
Expected: `Compiled successfully`, and the `/` route listed in the build output. `next-env.d.ts` is generated — commit it.

Run:
```bash
pnpm --filter @wintel/web run start &
sleep 5
curl -s http://localhost:3000 | grep -c 'Website Intelligence Platform'
```
Expected: a count of at least `1`.

Stop the background processes:
```bash
kill %1 %2
```

- [ ] **Step 13: Lint and typecheck**

Run:
```bash
pnpm --filter @wintel/web run lint && pnpm --filter @wintel/web run typecheck
```
Expected: both exit 0.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(web): add next.js dashboard reporting live api health"
```

---

### Task 11: Continuous integration and full-stack verification

Locks the foundation in: every push runs the same commands a developer runs, against the same infrastructure.

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (add a CI badge line — only after the workflow exists)

**Interfaces:**
- Consumes: root scripts `format:check`, `lint`, `typecheck`, `test`, `build`, `db:migrate` from Tasks 1, 3 and 6.
- Produces: a `verify` job gating every pull request.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Lint, typecheck, test, build
    runs-on: ubuntu-latest
    timeout-minutes: 20

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: wintel
          POSTGRES_PASSWORD: wintel
          POSTGRES_DB: wintel
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U wintel -d wintel"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20

      redis:
        image: redis:7-alpine
        ports:
          - 6380:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20

    env:
      DATABASE_URL: postgresql://wintel:wintel@localhost:5433/wintel?schema=public
      REDIS_URL: redis://localhost:6380
      NEXT_PUBLIC_API_URL: http://localhost:4000
      NODE_ENV: test

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Write .env for the Prisma CLI
        # The Prisma CLI resolves .env relative to its own working directory, which is
        # packages/database. The db:* scripts point dotenv-cli at the repo root, so the file
        # has to exist there even when the values already live in the job environment.
        run: printf 'DATABASE_URL=%s\nREDIS_URL=%s\n' "$DATABASE_URL" "$REDIS_URL" > .env

      - name: Apply migrations
        run: pnpm db:migrate

      - name: Check formatting
        run: pnpm format:check

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

- [ ] **Step 2: Verify the same sequence passes locally**

This is the whole point of the workflow — it must be reproducible on a laptop.

Run:
```bash
pnpm infra:up
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: every command exits 0. The `test` run reports passing suites for `@wintel/config`, `@wintel/types`, `@wintel/database`, `@wintel/ui`, `@wintel/api`, `@wintel/worker`, and `@wintel/web`.

- [ ] **Step 3: Verify the whole stack runs together**

Run:
```bash
pnpm dev
```
Expected: Turborepo starts `web`, `api`, and `worker`. Then, in a second terminal:

```bash
curl -s http://localhost:4000/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000
```
Expected: a JSON body with `"status":"ok"` and both dependency checks `"up"`, then `200`.

Open `http://localhost:3000` in a browser. Expected: the page shows an **Operational** badge and rows for **Database** and **Redis**, each with a green `up` badge and a latency figure.

Stop with `Ctrl+C`.

- [ ] **Step 4: Add the CI badge to the README**

Insert immediately below the `# Website Intelligence Platform` heading in `README.md`, replacing `<owner>/<repo>` with the actual GitHub path:
```markdown
[![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: verify lint, typecheck, tests and build on every push"
```

---

## Definition Of Done

The foundation slice is complete when all of the following hold:

1. `pnpm install && pnpm infra:up && pnpm db:migrate && pnpm dev` produces three running processes, a browser page at `http://localhost:3000` showing **Operational**, and `GET http://localhost:4000/api/v1/health` returning `"status":"ok"`.
2. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0 from a clean checkout.
3. Every package has at least one test that would fail if its core behaviour regressed, and the integration tests run against real Postgres and Redis rather than mocks.
4. A commit with a non-conventional message is rejected by the `commit-msg` hook.
5. Starting either the API or the worker with `DATABASE_URL` unset exits immediately with a message naming the missing variable — verify with:
   ```bash
   env -u DATABASE_URL pnpm --filter @wintel/api run start
   ```
   Expected: `Invalid environment configuration:` followed by `- DATABASE_URL: Invalid input`, and a non-zero exit code.
6. No product models exist in `schema.prisma`, no authentication code exists anywhere, and `apps/web` contains no business logic beyond fetching and rendering the health contract.

## What The Next Slice Inherits

The auth slice starts from: a validated-config boot path it plugs `BETTER_AUTH_SECRET` into, a `PrismaService` it adds models behind, a feature-module template in `apps/api/src/modules/health`, a shared contract package for its DTOs, a queue infrastructure for invitation emails, and a CI pipeline that will run its tests unchanged.




