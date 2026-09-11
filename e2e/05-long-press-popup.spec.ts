import { test, expect } from './fixtures';

test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
    userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});

test.describe('Long-press popup stays open on mobile', () => {
    test('close button click is ignored for 400ms after popup opens (touch)', async ({ mockedPage: page }) => {
        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        const categoryButton = page.getByText('Boissons').first();

        // Open popup via click
        await categoryButton.click();
        await expect(page.locator('#popup')).toBeVisible({ timeout: 5000 });

        // Immediately try to click the close button — simulates the phantom click
        // that the browser synthesizes when the finger lifts after a long-press.
        // On a real iPhone, this click would close the popup immediately.
        await page.evaluate(() => {
            const closeBtn = document.querySelector('#popup [aria-label="Close"]') as HTMLElement;
            if (closeBtn) closeBtn.click();
        });

        // Wait a moment
        await page.waitForTimeout(200);

        // The popup should STILL be visible — the justOpenedRef gate prevented the close
        await expect(page.locator('#popup')).toBeVisible();

        // Also try clicking the overlay (another way the phantom click could close the popup)
        await page.evaluate(() => {
            const overlay = document.querySelector('#popup')?.parentElement?.firstElementChild as HTMLElement;
            if (overlay) overlay.click();
        });

        await page.waitForTimeout(200);

        // Popup should still be visible
        await expect(page.locator('#popup')).toBeVisible();

        // After the gate expires (400ms), the close button should work
        await page.waitForTimeout(300);
        const closeButton = page.locator('#popup [aria-label="Close"]');
        await closeButton.click();
        await expect(page.locator('#popup')).not.toBeVisible({ timeout: 5000 });
    });
});
