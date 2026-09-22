import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    // electron-updater is pure JS and is bundled in, so the portable build
    // (which ships only out/) starts without a node_modules folder.
    plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })],
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
