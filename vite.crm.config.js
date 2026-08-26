import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Standalone CRM preview server. Serves the CRM at "/" on its own port so it
// gets a dedicated preview link, separate from the marketing website.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'crm-preview'),
  publicDir: path.resolve(import.meta.dirname, 'public'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    hmr: { clientPort: 443 },
    fs: { allow: [import.meta.dirname] }
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' }
  }
})
