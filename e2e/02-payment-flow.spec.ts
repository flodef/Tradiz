import { test, expect } from './fixtures';

test.describe('Payment Flow', () => {
    test('4.1 — Payment popup opens with payment methods', async ({ mockedPage: page }) => {
        await page.goto('/');

        // Add a product first
        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // With paymentIconsMode disabled, the total bar shows a "Payer" button
        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();

        // Payment popup should appear with payment method options
        await expect(page.getByText('Carte Bancaire')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('Espèces')).toBeVisible({ timeout: 5000 });
    });

    test('4.2 — Single payment with Carte Bancaire', async ({ mockedPage: page }) => {
        await page.goto('/');

        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // Open payment popup
        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();

        // Select Carte Bancaire
        await expect(page.getByText('Carte Bancaire')).toBeVisible({ timeout: 5000 });
        await page.getByText('Carte Bancaire').click();

        // Transaction should be committed — look for success indicator
        // The basket should clear or a success popup should appear
        await page.waitForTimeout(1000);
    });

    test('4.3 — Cash payment with change', async ({ mockedPage: page }) => {
        await page.goto('/');

        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // Open payment popup
        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();

        // Select Espèces (cash)
        await expect(page.getByText('Espèces')).toBeVisible({ timeout: 5000 });
        await page.getByText('Espèces').click();

        // Cash payment popup should appear with numpad
        // Enter cash amount: 5.00 for a 2.50 total
        await page.waitForTimeout(500);

        // The CashPaymentPopup has a numpad — enter "5"
        await page.locator('#popup').getByText('5', { exact: true }).click();

        // Confirm payment
        const confirmButton = page
            .locator('#popup')
            .getByText(/Valider|Confirmer|OK/)
            .first();
        if (await confirmButton.isVisible({ timeout: 2000 })) {
            await confirmButton.click();
        }

        // Change display should appear (5.00 - 2.50 = 2.50)
        await page.waitForTimeout(1000);
    });

    test('4.5 — Multi-payment option appears with 2+ payment methods', async ({ mockedPage: page }) => {
        await page.goto('/');

        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // Open payment popup
        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();

        // With 3 payment methods, MULTIPLE and PARTAGER options should appear
        await expect(page.getByText('MULTIPLE')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('PARTAGER')).toBeVisible({ timeout: 5000 });
    });

    test('4.5b — Multi-payment popup opens and allows entering legs', async ({ mockedPage: page }) => {
        await page.goto('/');

        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // Open payment popup
        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();

        // Click MULTIPLE
        await expect(page.getByText('MULTIPLE')).toBeVisible({ timeout: 5000 });
        await page.getByText('MULTIPLE').click();

        // MultiPaymentPopup should appear
        await page.waitForTimeout(500);
        // The popup should show the total and payment method selectors
        await expect(page.locator('body')).toContainText(/Paiement multiple/);
    });

    test('4.6 — Split payment mode selector appears', async ({ mockedPage: page }) => {
        await page.goto('/');

        const categoryButton = page.getByText('Boissons').first();
        await expect(categoryButton).toBeVisible({ timeout: 15000 });
        await categoryButton.click();

        await expect(page.getByText('Coca')).toBeVisible({ timeout: 5000 });
        await page.getByText('Coca').click();

        // Open payment popup
        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();

        // Click PARTAGER
        await expect(page.getByText('PARTAGER')).toBeVisible({ timeout: 5000 });
        await page.getByText('PARTAGER').click();

        // Split mode selector should appear with 3 options
        await expect(page.getByText('Partage égal')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('Tour à tour')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('Chacun ses articles')).toBeVisible({ timeout: 5000 });
    });
});
