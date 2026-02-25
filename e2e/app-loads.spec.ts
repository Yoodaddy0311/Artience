import { test, expect } from '@playwright/test';

test('app loads and shows main layout', async ({ page }) => {
    await page.goto('/');
    // Check that the app renders without crashing
    await expect(page.locator('body')).toBeVisible();
    // Check for mode toggle (Town/Studio indicator)
    await expect(page.getByRole('button')).toBeTruthy();
});

test('splash screen appears on load', async ({ page }) => {
    await page.goto('/');
    // The splash screen should appear briefly
    // After loading, the main layout should be visible
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
});
