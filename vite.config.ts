import { defineConfig } from 'vite'

export default defineConfig({
  // Relative assets work at localhost, Netlify root, and a GitHub Pages
  // repository sub-path without maintaining separate build configurations.
  base: './',
  build: {
    chunkSizeWarningLimit: 600,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          return undefined
        },
      },
    },
  },
})
