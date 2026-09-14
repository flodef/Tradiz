import type { Page } from '@playwright/test';
import { test, expect, mockSubscription, mockEtabConfig } from './fixtures';

const CONFIG_URL = '/admin/kitchen/config';

/** Open the collapsed TopNav so nav items are rendered. */
async function expandTopNav(page: Page) {
    await page.getByRole('button', { name: 'Afficher la navigation' }).click();
}

/** Close the currently open popup via its Close button. */
async function closePopup(page: Page) {
    await page.locator('[aria-label="Close"]').last().click();
}

test.describe('Limites par formule — page Configuration', () => {
    test('Découverte : clients/entreprises/thèmes/statistiques masqués, quota 1 appareil', async ({
        mockedPage: page,
    }) => {
        await mockSubscription(page, { plan: 'decouverte', status: 'active' });
        // Grafana enabled — the stats link must stay hidden anyway (plan limit wins).
        await mockEtabConfig(page, { grafana_access_enabled: true });
        // One device already registered — the quota (1) is reached.
        await page.route('**/api/sql/getDevices', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ devices: [{ id: 1, label: 'Caisse 1', key: 'k1' }] }),
            })
        );
        await page.goto(CONFIG_URL);

        await expect(page.getByText('Appareils', { exact: true })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Clients', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Entreprises', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Thèmes', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Avis clients', { exact: true })).toHaveCount(0);

        // Open the devices section — quota reached → add button disabled
        await page.getByText('Appareils', { exact: true }).click();
        await expect(page.getByText('1/1 appareil(s)')).toBeVisible();
        await expect(page.getByText(/passez à une formule supérieure/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ajouter un appareil' })).toBeDisabled();

        await expandTopNav(page);
        await expect(page.locator('#nav [aria-label="Statistiques"]')).toHaveCount(0);
        await expect(page.locator('#nav [aria-label="Edition menu"]')).toBeVisible();
    });

    test('Pro : clients et statistiques visibles, entreprises/thèmes masqués, quota 2 appareils', async ({
        mockedPage: page,
    }) => {
        await mockSubscription(page, { plan: 'pro', status: 'active' });
        await mockEtabConfig(page, { grafana_access_enabled: true });
        await page.goto(CONFIG_URL);

        await expect(page.getByText('Appareils', { exact: true })).toBeVisible({ timeout: 20000 });
        await page.getByText('Appareils', { exact: true }).click();
        await expect(page.getByText('0/2 appareil(s)')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ajouter un appareil' })).toBeEnabled();

        await expect(page.getByText('Clients', { exact: true })).toBeVisible();
        await expect(page.getByText('Avis clients', { exact: true })).toBeVisible();
        await expect(page.getByText('Entreprises', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Thèmes', { exact: true })).toHaveCount(0);

        await expandTopNav(page);
        await expect(page.locator('#nav [aria-label="Statistiques"]')).toBeVisible();
    });

    test('Privilège : toutes les sections visibles, pas de quota appareils affiché', async ({ mockedPage: page }) => {
        await mockSubscription(page, { plan: 'privilege', status: 'active' });
        await mockEtabConfig(page, { grafana_access_enabled: true });
        await page.goto(CONFIG_URL);

        await expect(page.getByText('Appareils', { exact: true })).toBeVisible({ timeout: 20000 });
        // Unlimited devices — no quota counter is rendered.
        await expect(page.getByText(/appareil\(s\) utilisé\(s\) par votre formule/)).toHaveCount(0);

        await expect(page.getByText('Clients', { exact: true })).toBeVisible();
        await expect(page.getByText('Entreprises', { exact: true })).toBeVisible();
        await expect(page.getByText('Thèmes', { exact: true })).toBeVisible();

        await expandTopNav(page);
        await expect(page.locator('#nav [aria-label="Statistiques"]')).toBeVisible();
    });
});

test.describe('Abonnement arrêté — POS en lecture seule', () => {
    test('seuls Z, calculatrice, recherche et topnav restent accessibles', async ({ mockedPage: page }) => {
        await mockSubscription(page, { plan: 'privilege', status: 'stopped' });
        await page.goto('/');

        // Lock screen replaces the numpad
        await expect(page.getByText('Abonnement suspendu')).toBeVisible({ timeout: 20000 });
        await expect(
            page.getByText('Mode lecture seule — reprenez votre abonnement dans la configuration')
        ).toBeVisible();

        // Categories (and therefore product selection) are gone
        await expect(page.getByText('Boissons', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Plats', { exact: true })).toHaveCount(0);
        // Numpad digits are gone
        await expect(page.getByText('7', { exact: true })).toHaveCount(0);

        // Search still opens
        await page.locator('.tabler-icon-search').first().click();
        await expect(page.getByText('Recherche')).toBeVisible();
        await closePopup(page);

        // Calculator still opens
        await page.locator('.tabler-icon-calculator').first().click();
        await expect(page.getByText('Calculatrice')).toBeVisible();
        await closePopup(page);

        // Z still opens its popup (no transactions → sync menu)
        await page.getByText('z', { exact: true }).click();
        await expect(page.getByText('Synchronisation').first()).toBeVisible();
        await closePopup(page);

        // Top navigation still available
        await expandTopNav(page);
        await expect(page.locator('#nav [aria-label="Configuration"]')).toBeVisible();
    });

    test('la recherche ne permet pas d\u2019ajouter un produit en lecture seule', async ({ mockedPage: page }) => {
        await mockSubscription(page, { plan: 'privilege', status: 'stopped' });
        await page.goto('/');

        await expect(page.getByText('Abonnement suspendu')).toBeVisible({ timeout: 20000 });

        await page.locator('.tabler-icon-search').first().click();
        await expect(page.getByText('Recherche')).toBeVisible();

        // Type a product name and pick it — the sale must be refused
        await page.getByPlaceholder('Recherche...').fill('Coca');
        await page.getByText('Coca').first().click();

        // The popup closes but nothing is added to the ticket
        await expect(page.getByText('Recherche')).toHaveCount(0);
        await expect(page.getByText('Coca')).toHaveCount(0);
    });

    test('passage en lecture seule à la volée (événement subscription-changed)', async ({ mockedPage: page }) => {
        const state = await mockSubscription(page, { plan: 'privilege', status: 'active' });
        await page.goto('/');

        // Active subscription — the POS works normally
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        // The subscription is stopped elsewhere — simulate the change being
        // picked up (poll / focus / subscription-changed event).
        state.status = 'stopped';
        await page.evaluate(() => window.dispatchEvent(new Event('subscription-changed')));

        await expect(page.getByText('Abonnement suspendu')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Boissons', { exact: true })).toHaveCount(0);
    });
});
