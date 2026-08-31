import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiMock } from './src/dev-api-mock.js'

export default defineConfig({
  base: '/',
  plugins: [react(), devApiMock()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('@supabase') || id.includes('node_modules/@supabase')) return 'vendor-supabase';
          return undefined;
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    hmr: { clientPort: 443 }
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' }
  }
})
