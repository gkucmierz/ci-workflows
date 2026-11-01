import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Deterministic port for @gkucmierz/ci-workflows is 30172
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 30172,
    strictPort: true,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
