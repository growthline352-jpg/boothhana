import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'local-outings-read-only',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const pathname = new URL(req.url, 'http://localhost').pathname
        const allowed = (req.method === 'GET' && pathname.startsWith('/api/public/')) ||
          (req.method === 'POST' && pathname === '/api/public/library/resolve')
        if (allowed) return next()
        res.statusCode = pathname === '/api/me' ? 401 : 403
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: res.statusCode, code: 'LOCAL_PREVIEW', message: '로컬에서는 기기 저장으로 이용해 주세요.' }))
      })
    },
  }],
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
  server: { host: '127.0.0.1', port: 4193, strictPort: true, proxy: { '/api': { target: 'https://api.boothana.kr', changeOrigin: true } } },
  build: { outDir: 'dist-outings-preview', rollupOptions: { input: 'outings-preview.html' } },
})
