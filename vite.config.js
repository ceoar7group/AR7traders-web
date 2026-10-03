import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiMock } from './src/dev-api-mock.js'

/* Dev-only: stop the browser reusing a stale module body.
 *
 * Vite rewrites every bare import to a versioned optimizer URL
 * (`/node_modules/.vite/deps/react.js?v=<hash>`). After a restart the hash
 * changes, but a 304 Not Modified makes the browser keep its OLD body — which
 * still points at the previous hash. A page then loads two copies of React and
 * the first hook throws "Cannot read properties of null (reading 'useState')".
 *
 * This middleware makes that impossible: module responses are never cached
 * (`Cache-Control: no-store`) and conditional requests are stripped, so Vite
 * always returns a freshly transformed body pointing at the current hash. */
function devFreshModules() {
  const noStore = (req, res) => {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => setHeader(name, /^cache-control$/i.test(String(name)) ? 'no-store' : value);
    if (res.appendHeader) {
      const appendHeader = res.appendHeader.bind(res);
      res.appendHeader = (name, value) => appendHeader(name, /^cache-control$/i.test(String(name)) ? 'no-store' : value);
    }
    const writeHead = res.writeHead.bind(res);
    res.writeHead = (status, ...rest) => {
      const headers = rest.find(a => a && typeof a === 'object');
      if (headers) for (const k of Object.keys(headers)) if (/^cache-control$/i.test(k)) headers[k] = 'no-store';
      return writeHead(status, ...rest);
    };
    setHeader('Cache-Control', 'no-store');
    // Nothing may re-add a cacheable directive after this point.
    const onHeaders = () => {
      if (!res.headersSent) setHeader('Cache-Control', 'no-store');
    };
    res.on('pipe', onHeaders);
    res.once('finish', () => res.removeListener('pipe', onHeaders));
  };
  return {
    name: 'ar7-dev-fresh-modules',
    apply: 'serve',
    // `vite preview` serves the same trap for the HTML document: a cached
    // index.html points at the previous hashed bundle. The document is what
    // must never be reused — the hashed assets behind it are immutable anyway.
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (/\.(js|mjs|css|map|png|jpe?g|webp|svg|woff2?|ico)(\?|$)/.test(url)) return next();
        noStore(req, res);
        next();
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!/\.(jsx?|mjs|tsx?|css|map)(\?|$)/.test(url)) return next();
        noStore(req, res);
        next();
      });
    }
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), devApiMock(), devFreshModules()],
  // The dev server must never hand out two copies of React: a second copy has a
  // null dispatcher, and every hook in the app then throws "Cannot read
  // properties of null (reading 'useState')". Dedupe pins one copy, and the
  // explicit include list keeps the optimized chunk set stable instead of
  // re-optimizing (and splitting the graph) mid-session.
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'lucide-react']
  },
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
