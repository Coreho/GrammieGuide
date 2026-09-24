import tseslint from '@electron-toolkit/eslint-config-ts'

export default tseslint.config(
  { ignores: ['out', 'dist', 'node_modules', 'UI Screenshots'] },
  tseslint.configs.recommended,
  {
    rules: {
      // `_`-prefixed destructuring is the deliberate way secrets are stripped
      // (see toPublicConfig / config:set), not dead code.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }
      ]
    }
  },
  {
    // React components' return type is always JSX; annotating every one adds noise.
    files: ['**/*.tsx'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' }
  }
)
