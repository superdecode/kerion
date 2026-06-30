import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 4500,
    host: '0.0.0.0',
    open: true,
    hmr: {
      host: 'localhost',
      port: 4500,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:30002',
        changeOrigin: true
      }
    }
  }
})
