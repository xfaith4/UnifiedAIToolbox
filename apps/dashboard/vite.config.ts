import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          // Mock telemetry endpoints when backend is unavailable
          proxy.on('error', (err, req, res) => {
            if (req.url?.includes('/api/telemetry')) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              
              // Generate mock telemetry data
              const days = parseInt(new URL(req.url, 'http://localhost').searchParams.get('days') || '7')
              const mockData = {
                total_events: 0,
                period_days: days,
                start_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
                end_date: new Date().toISOString(),
                by_event_type: {},
                by_source: {},
                by_day: {}
              }
              
              res.end(JSON.stringify(mockData))
            } else {
              console.error(`Proxy error for ${req.url}:`, err.message)
            }
          })
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
