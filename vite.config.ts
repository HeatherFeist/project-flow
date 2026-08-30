import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),
    tailwindcss(),
    // Makes the app installable (Tier 1 of the "phone app" question —
    // see README's "Installable app (PWA)" section). Precaches only the
    // built app shell (JS/CSS/HTML/icons) so the app opens instantly and
    // survives a flaky connection — deliberately does NOT cache Supabase
    // API/Edge Function responses, so client/job/invoice/payment data is
    // always live, never served stale from a cache. registerType:
    // 'autoUpdate' means a new deploy replaces the cached shell on the
    // visitor's very next load, no stuck-on-old-version problem.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Project Flow',
        short_name: 'Project Flow',
        description: 'Job management for handyman & field-service businesses.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0d9488',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the build output — no runtime caching rules are added, so
        // requests to supabase.co (data, auth, storage, functions) are
        // never intercepted by the service worker and always go live.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
