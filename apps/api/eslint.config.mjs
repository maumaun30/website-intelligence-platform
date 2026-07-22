import base from '@wintel/eslint-config';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS expresses DI and routing through decorators on classes whose members are
      // assigned by the framework; the base rule set assumes plain modules.
      '@typescript-eslint/no-extraneous-class': 'off',
      // The base config lints without type information, so `consistent-type-imports` cannot
      // see that `emitDecoratorMetadata` is on and that Nest resolves constructor parameters
      // like `private readonly health: HealthService` (no explicit `@Inject` token) from that
      // metadata at runtime. Auto-fixing such an import to `import type` erases it from the
      // compiled output and the class-typed parameter silently stops resolving — the pipe
      // still typechecks, it just breaks in production. Until the shared config lints with
      // type information and can special-case decorated classes, this stays off here.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
