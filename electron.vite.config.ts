import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Where anonymous usage pings go, baked in at build time. Empty (the default)
// means the build never sends anything at all. Set it in package.json under
// "beari": { "analyticsEndpoint": "https://..." }.
const analyticsEndpoint: string =
  JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).beari?.analyticsEndpoint ?? ''

export default defineConfig({
  main: {
    // electron-updater is pure JS and is bundled in, so the portable build
    // (which ships only out/) starts without a node_modules folder.
    plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })],
    define: { __ANALYTICS_URL__: JSON.stringify(analyticsEndpoint) },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          character: resolve(__dirname, 'src/renderer/character.html'),
          dashboard: resolve(__dirname, 'src/renderer/dashboard.html')
        }
      }
    }
  }
})
