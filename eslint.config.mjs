import tseslint from '@electron-toolkit/eslint-config-ts'

export default tseslint({
  ignores: ['out', 'dist', 'node_modules']
})
