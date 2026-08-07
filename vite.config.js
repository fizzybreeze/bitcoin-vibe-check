import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Service-worker runtime caching, one entry per data source the dashboard
// actually calls — keep this in step with the "External APIs" table in
// CLAUDE.md, which is what pwaRuntimeCaching.test.js asserts.
//
// NetworkFirst throughout: the network answer always wins when it arrives, and
// the cache is only consulted when the request fails or exceeds the timeout.
// That is the behaviour a price dashboard wants — stale numbers on a dead
// connection, never stale numbers on a live one.
//
// Exported for unit tests; the VitePWA config below is the only production
// consumer.
export const runtimeCaching = [
  {
    // Price, volume, market cap, dominance.
    urlPattern: /^https:\/\/api\.coinpaprika\.com\//,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-coinpaprika',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 10, maxAgeSeconds: 3600 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // OHLC candles for every chart range, plus the seed ticker. Four ranges
    // are prefetched per session, hence the larger entry count.
    urlPattern: /^https:\/\/api\.kraken\.com\//,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-kraken',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    urlPattern: /^https:\/\/mempool\.space\//,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-mempool',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    urlPattern: /^https:\/\/api\.alternative\.me\//,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-alternative',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 10, maxAgeSeconds: 3600 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // The Vibe Score history read of `metric_snapshots`. Scoped to that table
    // rather than to the Supabase host: the only other browser call to Supabase
    // is the donor list, and a shared rule would put the supporter ticker on
    // this one's day-long expiry. The series gains one point per UTC day, so
    // caching it for a day cannot show anything the network would not.
    urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/metric_snapshots/,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-metric-snapshots',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 5, maxAgeSeconds: 86400 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Own serverless MVRV route. Already cached 24h at the CDN edge, so the
    // long maxAge here mirrors that rather than inventing a second policy.
    urlPattern: /\/api\/chain-data/,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-chain-data',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 5, maxAgeSeconds: 86400 },
      cacheableResponse: { statuses: [200] },
    },
  },
]

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching,
      },
    }),
  ],
})
