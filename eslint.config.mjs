import base from '@wintel/eslint-config';

// This is the config ESLint finds when it is invoked from the repo root — which is how
// lint-staged runs on commit. It therefore has to cover apps/ and packages/ too, or staged
// files inside a workspace package would be silently skipped by the pre-commit gate.
//
// Framework-specific rules (React, Next, NestJS) live in each package's own eslint.config.mjs
// and run under `pnpm lint`, which invokes ESLint from inside each package.
export default [
  ...base,
  {
    // NestJS apps compile with `emitDecoratorMetadata`, so Nest resolves constructor
    // parameters like `private readonly health: HealthService` from the emitted
    // `design:paramtypes` metadata at runtime — the class import is a real value use even
    // though it only appears in a type position. The base `consistent-type-imports` rule
    // lints without type information, cannot see this, and its autofix rewrites the import to
    // `import type`, which erases it from the compiled output and silently breaks DI in
    // production. Each app's own eslint.config.mjs already disables the rule under `pnpm lint`;
    // this mirrors it for the lint-staged path so a commit hook cannot reintroduce the bug.
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
