import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })

test('installs the PWA and opens the studio offline under the repository path', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Import Video' })).toBeVisible()
  expect(await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return new URL(registration.scope).pathname
  })).toBe('/LivePhotoStudio-Web/')
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated')
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Import Video' })).toBeVisible()
  await expect(page.getByAltText('Alpine lake at twilight')).toBeVisible()
})
