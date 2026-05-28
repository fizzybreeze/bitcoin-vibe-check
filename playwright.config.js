import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5175' },
  webServer: {
    command: 'npm run dev -- --port 5175',
    url: 'http://localhost:5175',
    reuseExistingServer: true,
  },
})
