import { test, expect } from './fixtures';

test.describe('Stock — Derived Stock Behavior', () => {
    test('5.1 — Product with stock=1 shows as sold out after adding to cart', async ({ mockedPage: page }) => {
        await page.goto('/');

        // Open Boissons category
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        // Jus has stock=1 — should be visible and selectable in the popup
        const popup = page.locator('#popup');
        await expect(popup.getByText('Jus')).toBeVisible({ timeout: 5000 });
        await popup.getByText('Jus').click();

        // Now open the category again — Jus should show as sold out (Épuisé)
        await categoryButton.click();
        await expect(popup.getByText('Jus')).toBeVisible({ timeout: 5000 });
        // The product should show "Épuisé" suffix
        await expect(popup).toContainText(/Épuisé/);
    });

    test('5.2 — Stock restores when product is removed from cart', async ({ mockedPage: page }) => {
        await page.goto('/');

        // Add Jus (stock=1)
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        const popup = page.locator('#popup');
        await expect(popup.getByText('Jus')).toBeVisible({ timeout: 5000 });
        await popup.getByText('Jus').click();

        // Jus should now be in the basket and sold out
        await categoryButton.click();
        await expect(popup.getByText('Jus')).toBeVisible({ timeout: 5000 });
        await expect(popup).toContainText(/Épuisé/);

        // Reload the page — the cart (products.current ref) resets on reload,
        // so Jus should no longer be in the cart and stock should be restored.
        // With the old decrement model, the stock was stored in localStorage
        // and would NOT restore on reload. With the derived model, stock is
        // computed from transactions + cart, both of which are empty after reload.
        await page.reload();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        // Jus should no longer be sold out
        await expect(popup.getByText('Jus')).toBeVisible({ timeout: 5000 });
        await expect(popup).not.toContainText(/Épuisé/);
    });

    test('5.3 — Stock does not double-decrement on page reload', async ({ mockedPage: page }) => {
        await page.goto('/');

        // Add Coca (stock=10)
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        const popup = page.locator('#popup');
        await expect(popup.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await popup.getByText('Coca').click();

        // Reload the page — stock should not be affected by the reload
        // (with the old decrement model, reloading would re-decrement stock
        // because addProduct was called during PROCESSING transaction restore)
        await page.reload();

        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        // Coca should still be available (stock=10, not decremented by reload)
        await expect(popup.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await expect(popup).not.toContainText(/Épuisé/);
    });

    test('5.4 — Multiple additions of the same product decrease stock correctly', async ({ mockedPage: page }) => {
        await page.goto('/');

        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });

        const popup = page.locator('#popup');

        // Add Coca 3 times (stock=10, should show 7 remaining after)
        for (let i = 0; i < 3; i++) {
            await categoryButton.click();
            await expect(popup.getByText('Coca')).toBeVisible({ timeout: 5000 });
            await popup.getByText('Coca').click();
            await page.waitForTimeout(200);
        }

        // Open category — Coca should still be available (7 remaining, not sold out)
        await categoryButton.click();
        await expect(popup.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await expect(popup).not.toContainText(/Épuisé/);
    });
});
