import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
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
