import base from '@wintel/eslint-config';

// This is the config ESLint finds when it is invoked from the repo root — which is how
// lint-staged runs on commit. It therefore has to cover apps/ and packages/ too, or staged
// files inside a workspace package would be silently skipped by the pre-commit gate.
//
// Framework-specific rules (React, Next, NestJS) live in each package's own eslint.config.mjs
// and run under `pnpm lint`, which invokes ESLint from inside each package.
export default base;
