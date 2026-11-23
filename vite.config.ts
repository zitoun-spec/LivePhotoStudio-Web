import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'demo.webp'],
      manifest: {
        id: './',
        name: 'Live Photo Studio',
        short_name: 'Live Photo',
        description: 'Convert an entire video into a paired Apple Live Photo JPEG and MOV.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#09090e',
        theme_color: '#09090e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,css,js,woff2,png,svg,webp,webmanifest}'],
        globIgnores: ['**/ffmpeg-core*', '**/splash-*.png'],
        navigateFallback: 'index.html',
        runtimeCaching: [{
          urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/ffmpeg-core.*\.(js|wasm)$/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'live-photo-engine', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 } },
        }],
      },
    }),
  ],
  build: { target: 'safari17' },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
})
