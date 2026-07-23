import base from '@wintel/eslint-config';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS expresses DI and routing through decorators on classes whose members are
      // assigned by the framework; the base rule set assumes plain modules.
      '@typescript-eslint/no-extraneous-class': 'off',
      // NestJS resolves constructor parameters from emitDecoratorMetadata at runtime, so a
      // class import in a type position is a real value use. Auto-fixing it to `import type`
      // erases it from the compiled output and silently breaks DI. See apps/api for the full
      // rationale; the root config mirrors this off for the lint-staged path too.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
