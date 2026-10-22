import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-cli', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true, allowExportNames: ['useApp'] },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Portable core: runs headless in the CLI/MCP server, so no React and no DOM globals.
    files: [
      'src/core/**/*.ts',
      'src/spec/**/*.ts',
      'src/math/**/*.ts',
      'src/state/appReducer.ts',
      'src/export/canvasExporter.ts',
      'src/export/markdownSerializer.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'Portable core must not depend on React.' }] },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Portable core must not touch the DOM; inject a RenderBackend instead.' },
        { name: 'document', message: 'Portable core must not touch the DOM; inject a RenderBackend instead.' },
        { name: 'Image', message: 'Portable core must not touch the DOM; inject a RenderBackend instead.' },
      ],
    },
  },
  {
    files: ['cli/**/*.ts', 'src/core/node/**/*.ts', 'tests/node/**/*.ts', 'tsup.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
