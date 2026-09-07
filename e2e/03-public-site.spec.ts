import { test as base, expect } from '@playwright/test';

// ── Mock catalog data ──

const mockCatalog = {
    shop: {
        name: 'Test Bistro',
        address: '10 Rue de la Paix',
        zipCode: '75002',
        city: 'Paris',
        phone: '01 23 45 67 89',
        email: 'contact@testbistro.fr',
        logo: '',
        image: '',
    },
    currencies: [{ label: 'Euro', symbol: '€', maxValue: 999.99, decimals: 2, rate: 1, fee: 0 }],
    articles: [
        { label: 'Coca', price: 2.5, category: 'Boissons', stock: 10, photo: '', description: '' },
        { label: 'Eau', price: 1.5, category: 'Boissons', stock: 0, photo: '', description: '' },
        {
            label: 'Pizza Margherita',
            price: 12,
            category: 'Plats',
            stock: 5,
            photo: '',
            description: 'Classique pizza italienne',
        },
        {
            label: 'Salade César',
            price: 0,
            category: 'Plats',
            stock: null,
            photo: '',
            description: 'Prix variable selon garniture',
        },
    ],
    openingHours: {
        0: [{ open: '12:00', close: '14:30' }], // Monday
        1: [
            { open: '12:00', close: '14:30' },
            { open: '19:00', close: '22:30' },
        ], // Tuesday
        2: [
            { open: '12:00', close: '14:30' },
            { open: '19:00', close: '22:30' },
        ], // Wednesday
        3: [
            { open: '12:00', close: '14:30' },
            { open: '19:00', close: '22:30' },
        ], // Thursday
        4: [
            { open: '12:00', close: '14:30' },
            { open: '19:00', close: '23:00' },
        ], // Friday
        5: [{ open: '19:00', close: '23:00' }], // Saturday
        // Sunday closed (no entry for key 6)
    },
};

const test = base.extend({});

test.describe('Public website', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the public catalog API
        await page.route('**/api/public/catalog', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockCatalog),
            });
        });
    });

    test('loads and displays shop name and categories', async ({ page }) => {
        await page.goto('/site');

        // Shop name should be visible
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible();

        // Category headings should be visible
        await expect(page.getByRole('heading', { name: 'Boissons' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Plats' })).toBeVisible();
    });

    test('hides sold-out items by default and shows them when toggle is on', async ({ page }) => {
        await page.goto('/site');

        // "Eau" (stock=0) should not be visible initially
        await expect(page.getByText('Eau')).not.toBeVisible();

        // Sold-out toggle should be visible
        const toggle = page.getByRole('switch');
        await expect(toggle).toBeVisible();

        // Click toggle to show sold-out items
        await toggle.click();

        // Now "Eau" should be visible with "Épuisé" label
        await expect(page.getByText('Eau')).toBeVisible();
        await expect(page.getByText('Épuisé').first()).toBeVisible();
    });

    test('hides price when price is 0', async ({ page }) => {
        await page.goto('/site');

        // "Salade César" has price 0 — the name should be visible but no "0.00 €" price
        const saladCard = page.locator('section').filter({ hasText: 'Salade César' });
        await expect(saladCard).toBeVisible();

        // Ensure no "0,00 €" or "0.00 €" price text is shown for this card
        await expect(saladCard.getByText(/0[.,]00\s*€/)).not.toBeVisible();
    });

    test('shows product description when available', async ({ page }) => {
        await page.goto('/site');

        // Pizza has a description
        const pizzaCard = page.locator('section').filter({ hasText: 'Pizza Margherita' });
        await expect(pizzaCard.getByText('Classique pizza italienne')).toBeVisible();
    });

    test('opens contact form modal', async ({ page }) => {
        await page.goto('/site');

        // Click "Nous contacter" button (desktop nav)
        const contactBtn = page.getByRole('button', { name: 'Nous contacter' });
        await contactBtn.click();

        // Modal should appear with form fields
        await expect(page.getByRole('heading', { name: 'Nous contacter' })).toBeVisible();
        await expect(page.getByPlaceholder('Votre nom')).toBeVisible();
        await expect(page.getByPlaceholder('votre@email.com')).toBeVisible();
        await expect(page.getByPlaceholder('Sujet de votre message')).toBeVisible();
        await expect(page.getByPlaceholder('Votre message…')).toBeVisible();
    });

    test('opens map modal when clicking address', async ({ page }) => {
        await page.goto('/site');

        // Click the address button (first one in header area)
        const addressBtn = page.getByRole('button', { name: /Rue de la Paix/ }).first();
        await addressBtn.click();

        // Map modal should appear (h3 in modal, not h1 in header)
        await expect(page.locator('h3').filter({ hasText: 'Test Bistro' })).toBeVisible();
        await expect(page.locator('iframe[title="Carte"]')).toBeVisible();
    });

    test('displays opening hours section', async ({ page }) => {
        await page.goto('/site');

        // Scroll to opening hours section
        const horairesSection = page.locator('#horaires');
        await expect(horairesSection).toBeVisible();

        // Check that day names are shown
        await expect(horairesSection.getByText('Lundi')).toBeVisible();
        await expect(horairesSection.getByText('Dimanche')).toBeVisible();

        // Sunday should show "Fermé"
        const sundayRow = horairesSection.locator('div').filter({ hasText: 'Dimanche' });
        await expect(sundayRow.getByText('Fermé')).toBeVisible();
    });

    test('shows open/closed status badge in navigation', async ({ page }) => {
        await page.goto('/site');

        // The nav should have an open/closed badge (desktop view)
        // Either "Ouvert" or "Fermé" should be visible in the nav area
        const nav = page.locator('nav');
        await expect(nav.getByText(/^(Ouvert|Fermé)$/)).toBeVisible();
    });

    test('does not render React hooks errors in console', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto('/site');
        await page.waitForLoadState('networkidle');

        // Wait a bit for any potential re-renders
        await page.waitForTimeout(1000);

        const hookErrors = consoleErrors.filter(
            (e) => e.includes('Rules of Hooks') || e.includes('Rendered more hooks')
        );
        expect(hookErrors).toHaveLength(0);
    });

    test('contact form shows validation when submitting empty', async ({ page }) => {
        await page.goto('/site');

        // Open contact modal
        await page.getByRole('button', { name: 'Nous contacter' }).click();

        // Try to submit empty form — browser should block it via required attributes
        const submitBtn = page.getByRole('button', { name: /Envoyer/ });
        await submitBtn.click();

        // The form should still be visible (not sent)
        await expect(page.getByRole('heading', { name: 'Nous contacter' })).toBeVisible();
    });

    test('footer displays shop contact information', async ({ page }) => {
        await page.goto('/site');

        const footer = page.locator('footer');
        await expect(footer.getByText('Test Bistro', { exact: true })).toBeVisible();
        await expect(footer.getByText('01 23 45 67 89')).toBeVisible();
        await expect(footer.getByText('contact@testbistro.fr')).toBeVisible();
    });
});
