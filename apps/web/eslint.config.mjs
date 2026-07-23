import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import react from '@wintel/eslint-config/react';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...react,
  ...compat.extends('next/core-web-vitals'),
  {
    // No `files` restriction: next/core-web-vitals installs eslint-config-next's own parser for
    // every file (including this .mjs config), and the base config's consistent-type-imports rule
    // then runs under that parser, which does not expose the parser services the rule now asks
    // for, so it throws instead of linting. This app is plain React with no decorator metadata,
    // so the rule buys nothing here; disable it everywhere. The root config still applies it to
    // these files under the base parser on the lint-staged path.
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];

export default config;
