import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Standalone CRM preview server. Serves the CRM at "/" on its own port so it
// gets a dedicated preview link, separate from the marketing website.
export default defineConfig({
  root: path.resolve(__dirname, 'crm-preview'),
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    fs: { allow: [__dirname] }
  }
})
