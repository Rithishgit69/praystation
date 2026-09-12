import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // tools/ are Node scripts that drive a browser page (mixed globals); they are not shipped code.
  { ignores: ['dist', 'node_modules', 'android', 'ios', 'dev-dist', 'tools/**', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
);
