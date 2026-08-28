import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiMock } from './src/dev-api-mock.js'

export default defineConfig({
  base: '/',
  plugins: [react(), devApiMock()],
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
