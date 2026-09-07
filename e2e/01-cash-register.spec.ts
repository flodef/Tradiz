import { test, expect } from './fixtures';

test.describe('Cash Register — Product Selection', () => {
    test('1.1 — Category bar renders after load', async ({ mockedPage: page }) => {
        await page.goto('/');
        // Wait for the app to load (state becomes loaded/preloaded)
        // The category bar is at the bottom of the screen
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Plats').first()).toBeVisible({ timeout: 5000 });
    });

    test('1.2 — Click category opens product popup', async ({ mockedPage: page }) => {
        await page.goto('/');
        // Wait for categories to appear
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });

        // Click the category
        await categoryButton.click();

        // A popup should appear with product names
        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('Eau')).toBeVisible({ timeout: 5000 });
    });

    test('1.3 — Select product adds to basket', async ({ mockedPage: page }) => {
        await page.goto('/');
        // Wait for and click category
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        // Click a product in the popup
        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // The product should appear in the total/basket area
        // Wait for popup to close and product to be in the basket
        await expect(page.getByText('Coca').first()).toBeVisible({ timeout: 5000 });
    });

    test('1.4 — Multiple products accumulate in basket', async ({ mockedPage: page }) => {
        await page.goto('/');
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        // Add Coca
        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // Add another product from Plats category
        const platsButton = page.getByText('Plats').first();
        await expect(platsButton).toBeVisible({ timeout: 5000 });
        await platsButton.click();

        await expect(page.getByText('Pizza')).toBeVisible({ timeout: 5000 });
        await page.getByText('Pizza').click();

        // Both products should be visible in the basket
        await expect(page.getByText('Coca').first()).toBeVisible();
        await expect(page.getByText('Pizza').first()).toBeVisible();
    });
});

test.describe('NumPad — Quantity & Amount Entry', () => {
    test('2.1 — Numeric input updates amount display', async ({ mockedPage: page }) => {
        await page.goto('/');
        // Wait for the app to load
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 15000 });

        // The numpad should have digit buttons. Click "1" and "0" to enter 10
        await page.getByText('1', { exact: true }).first().click();
        await page.getByText('0', { exact: true }).first().click();

        // The amount display should show 10 (or 10.00)
        // The Amount component displays the current amount
        await expect(page.locator('body')).toContainText(/10/);
    });
});

test.describe('Total — Basket Display', () => {
    test('3.1 — Basket displays added products with total', async ({ mockedPage: page }) => {
        await page.goto('/');
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // The total area should show the product and a total amount
        // Coca costs 2.50 EUR
        await expect(page.getByText('Coca').first()).toBeVisible();
        // Total should contain "2.50" or "2,50" (French formatting)
        await expect(page.locator('body')).toContainText(/2[.,]50/);
    });

    test('3.2 — Total updates when adding multiple products', async ({ mockedPage: page }) => {
        await page.goto('/');
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        // Add Coca (2.50)
        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // Add Eau (1.50) from same category
        const categoryButton2 = page.getByText('Boissons').first();
        await expect(categoryButton2).toBeVisible({ timeout: 5000 });
        await categoryButton2.click();

        await expect(page.getByText('Eau')).toBeVisible({ timeout: 5000 });
        await page.getByText('Eau').click();

        // Total should be 4.00 (2.50 + 1.50)
        await expect(page.locator('body')).toContainText(/4[.,]00|4[.,]0\b/);
    });
});
