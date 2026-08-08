import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Server-side code: Vercel serverless functions, standalone scripts, and the
  // build/test configs all run in Node, not the browser.
  {
    files: ['api/**/*.js', 'scripts/**/*.js', 'e2e/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  // The service worker runs in neither. `self` there is a
  // ServiceWorkerGlobalScope, not a Window — `clients`, `registration` and
  // `skipWaiting` exist and `document` does not, so the browser globals would
  // be wrong in both directions.
  {
    files: ['src/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
])
