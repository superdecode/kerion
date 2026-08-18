import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3002'

export default defineConfig({
  plugins: [
    react(),
    // Generates a legacy build with polyfills for older Chrome (PDAs, Zebra/Honeywell scanners)
    // that may not support ES modules (Chrome < 61) or modern JS features.
    legacy({
      targets: ['Chrome >= 52', 'Android >= 5'],
      modernPolyfills: true,
      // Polyfill core-js features detected in the bundle for the legacy target
      polyfills: true,
    }),
  ],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-data': ['@tanstack/react-query', 'zustand'],
          // Heavy, feature-specific deps in their own chunks so they load only
          // when the exporting/charting screen that needs them is opened.
          'vendor-xlsx': ['xlsx'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
  server: {
    port: 4500,
    strictPort: true,
    host: '0.0.0.0',
    open: true,
    hmr: {
      port: 4500,
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
})
