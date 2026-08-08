import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The PWA config, exported so `pwaServiceWorker.test.js` can hold the strategy
// in place. It is `injectManifest` rather than the default `generateSW`,
// because generateSW writes the whole worker from this block and leaves no
// source file to hang a `push` or `notificationclick` listener on — which is
// the one thing real push notifications (§4.1) require. Reverting to
// generateSW would still build, still cache correctly, and silently drop those
// listeners; that is what the test is for.
//
// `runtimeCaching` moved to `src/lib/runtimeCaching.js` with this switch. Under
// injectManifest a `workbox` block is ignored rather than rejected, so leaving
// the rules here would have looked configured and cached nothing.
export const pwaOptions = {
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.js',
  registerType: 'autoUpdate',
  manifest: false,
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  },
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(pwaOptions),
  ],
})
