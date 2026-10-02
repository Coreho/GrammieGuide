import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = {
  '@shared': resolve('src/shared')
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          launcher: resolve('src/preload/launcher.ts'),
          admin: resolve('src/preload/admin.ts'),
          browserView: resolve('src/preload/browserView.ts')
        },
        // Every window and the web view is sandboxed, and a sandboxed preload runs as a
        // plain script: the default ES module output (.mjs) fails on its first import.
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          launcher: resolve('src/renderer/launcher/index.html'),
          admin: resolve('src/renderer/admin/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
