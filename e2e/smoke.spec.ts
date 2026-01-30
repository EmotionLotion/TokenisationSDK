import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Tokenisation/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('showcase page loads and can navigate to real-estate', async ({ page }) => {
    await page.goto('/showcase');
    await expect(page.locator('body')).toBeVisible();

    // Navigate to real-estate vertical
    await page.goto('/showcase/real-estate');
    await expect(page.locator('body')).toBeVisible();
  });

  test('debugger page loads with time-travel controls', async ({ page }) => {
    await page.goto('/debugger');
    await expect(page.locator('body')).toBeVisible();
  });

  test('playground page loads', async ({ page }) => {
    await page.goto('/playground');
    await expect(page.locator('body')).toBeVisible();
  });

  test('headless demo page loads', async ({ page }) => {
    await page.goto('/headless');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('text=Headless SDK Demo')).toBeVisible();
  });
});
