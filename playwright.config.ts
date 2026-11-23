import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4175/LivePhotoStudio-Web/'
const chromium = process.env.LIVE_PHOTO_CHROMIUM

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  workers: 1,
  use: { baseURL, serviceWorkers: "block", trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromium ? { executablePath: chromium } : undefined,
      },
    },
    ...(process.env.LIVE_PHOTO_WEBKIT ? [
      { name: 'webkit', use: { ...devices['iPhone 13'] } },
    ] : []),
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort --base /LivePhotoStudio-Web/',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
