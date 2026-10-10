import js from '@eslint/js';
import globals from 'globals';
export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser, ecmaVersion: 2023, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }] },
  },
];
