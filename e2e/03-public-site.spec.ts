import { test as base, expect } from '@playwright/test';

// ── Mock catalog data ──

const SHOP_ID = 'test-bistro';

const mockShops = [
    {
        id: SHOP_ID,
        name: 'Test Bistro',
        logo: '',
        image: '',
        address: '10 Rue de la Paix',
        zipCode: '75002',
        city: 'Paris',
    },
];

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
    reservationPhone: false,
    reservationEmail: false,
};

const test = base.extend({});

test.describe('Public website — shop landing page', () => {
    test('lists all shops on /site', async ({ page }) => {
        await page.route('**/api/public/shops', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ shops: mockShops }),
            });
        });

        await page.goto('/site');

        // Shop name should be visible in a card
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });
        // "Voir le catalogue" link
        await expect(page.getByText('Voir le catalogue')).toBeVisible();
    });
});

test.describe('Public website — shop catalog page', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the shop-specific catalog API
        await page.route(`**/api/public/catalog/${SHOP_ID}`, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockCatalog),
            });
        });
        // Also mock the generic catalog endpoint (used by host-based routing fallback)
        await page.route('**/api/public/catalog', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockCatalog),
            });
        });
    });

    test('loads and displays shop name and categories', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);

        // Shop name should be visible (h1 in header)
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // Category headings should be visible (h2)
        await expect(page.getByRole('heading', { name: 'Boissons' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Plats' })).toBeVisible();
    });

    test('hides sold-out items by default and shows them when toggle is on', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);

        // Wait for page to load
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // "Eau" (stock=0) should not be visible initially
        await expect(page.getByText('Eau', { exact: true })).not.toBeVisible();

        // Sold-out toggle should be visible (only shown when soldOutCount > 0)
        const toggle = page.getByRole('switch');
        await expect(toggle).toBeVisible();

        // Click toggle to show sold-out items
        await toggle.click();

        // Now "Eau" should be visible
        await expect(page.getByText('Eau', { exact: true })).toBeVisible();
    });

    test('hides price when price is 0', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // "Salade César" has price 0 — the name should be visible but no "0.00 €" price
        // Product cards are <div> inside category <section>
        const saladCard = page.locator('div').filter({ hasText: 'Salade César' }).first();
        await expect(saladCard).toBeVisible();

        // Ensure no "0,00 €" or "0.00 €" price text is shown for this card
        await expect(saladCard.getByText(/0[.,]00\s*€/)).not.toBeVisible();
    });

    test('shows product description when available', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // Pizza has a description
        const pizzaCard = page.locator('div').filter({ hasText: 'Pizza Margherita' }).first();
        await expect(pizzaCard.getByText('Classique pizza italienne')).toBeVisible();
    });

    test('opens contact form modal', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // Click "Nous contacter" button (desktop nav)
        const contactBtn = page.getByRole('button', { name: 'Nous contacter' });
        await contactBtn.click();

        // Modal should appear with form fields (h3 heading in modal)
        await expect(page.getByRole('heading', { name: 'Nous contacter' })).toBeVisible();
        await expect(page.getByPlaceholder('Votre nom')).toBeVisible();
        await expect(page.getByPlaceholder('votre@email.com')).toBeVisible();
        await expect(page.getByPlaceholder('Sujet de votre message')).toBeVisible();
        await expect(page.getByPlaceholder('Votre message…')).toBeVisible();
    });

    test('opens map modal when clicking address', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // Click the address button in the header (no shop image, so header is shown)
        const addressBtn = page.getByRole('button', { name: /Rue de la Paix/ }).first();
        await addressBtn.click();

        // Map modal should appear (h3 in modal with shop name)
        await expect(page.locator('h3').filter({ hasText: 'Test Bistro' })).toBeVisible();
        await expect(page.locator('iframe[title="Carte"]')).toBeVisible();
    });

    test('displays opening hours in modal', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // Click the "Horaires d'ouverture" button to open the modal
        await page.getByRole('button', { name: /Horaires d'ouverture/ }).click();

        // The modal should be visible with day names
        const modal = page.locator('.fixed.inset-0.z-50').filter({ hasText: 'Horaires' });
        await expect(modal).toBeVisible();
        await expect(modal.getByText('Lundi')).toBeVisible();
        await expect(modal.getByText('Dimanche')).toBeVisible();

        // Sunday should show "Fermé"
        const sundayRow = modal.locator('div').filter({ hasText: 'Dimanche' });
        await expect(sundayRow.getByText('Fermé')).toBeVisible();
    });

    test('shows open/closed status badge', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // The open/closed badge should be visible in the status banner under the nav
        await expect(page.getByText(/^(Ouvert|Fermé)$/)).toBeVisible();
    });

    test('does not render React hooks errors in console', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto(`/site/${SHOP_ID}`);
        await page.waitForLoadState('networkidle');

        // Wait a bit for any potential re-renders
        await page.waitForTimeout(1000);

        const hookErrors = consoleErrors.filter(
            (e) => e.includes('Rules of Hooks') || e.includes('Rendered more hooks')
        );
        expect(hookErrors).toHaveLength(0);
    });

    test('contact form shows validation when submitting empty', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        // Open contact modal
        await page.getByRole('button', { name: 'Nous contacter' }).click();

        // Try to submit empty form — browser should block it via required attributes
        const submitBtn = page.getByRole('button', { name: /Envoyer/ });
        await submitBtn.click();

        // The form should still be visible (not sent)
        await expect(page.getByRole('heading', { name: 'Nous contacter' })).toBeVisible();
    });

    test('footer displays shop contact information', async ({ page }) => {
        await page.goto(`/site/${SHOP_ID}`);
        await expect(page.getByRole('heading', { name: 'Test Bistro' })).toBeVisible({ timeout: 10000 });

        const footer = page.locator('footer');
        await expect(footer.getByText('Test Bistro', { exact: true })).toBeVisible();
        await expect(footer.getByText('01 23 45 67 89')).toBeVisible();
        await expect(footer.getByText('contact@testbistro.fr')).toBeVisible();
    });
});
