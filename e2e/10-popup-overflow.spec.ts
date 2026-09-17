import { test, expect } from './fixtures';

// closingHour = 23 in mockParameters — same business-day model as
// 08-closure.spec.ts: the auto sweep seals every open calendar day up to
// the day before the last boundary.
function expectedClosureTarget(): string {
    const boundary = new Date();
    boundary.setHours(23, 0, 0, 0);
    if (Date.now() < boundary.getTime()) boundary.setDate(boundary.getDate() - 1);
    const t = new Date(boundary.getFullYear(), boundary.getMonth(), boundary.getDate() - 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const paidTx = (createdDate: number) => ({
    orderId: String(createdDate),
    validator: 'Test User',
    method: 'ESPÈCES',
    amount: 10,
    currency: 'EUR',
    createdDate,
    modifiedDate: createdDate,
    products: [
        {
            label: 'Coca',
            category: 'Boissons',
            amount: 10,
            quantity: 1,
            discount: { amount: 0, unit: '%' },
            total: 10,
            vatRate: 20,
        },
    ],
    deviceId: 'test-e2e-device',
});

const LONG_ERROR =
    "Le mois 2026-09 est clôturé — l'écriture a été refusée. Cette période est encore en cours et n'aurait jamais dû être scellée : contactez le support pour régulariser la situation avant toute nouvelle vente.";

// Returns the list of elements inside the popup whose content overflows
// their box horizontally — i.e. text the cashier cannot fully read.
const clippedNodes = (root: import('@playwright/test').Locator) =>
    root.evaluate((el) => {
        const over = (n: Element) => n.scrollWidth > n.clientWidth + 1;
        return [el, ...el.querySelectorAll('*')]
            .filter(over)
            .map((n) => `${n.tagName}: ${(n as HTMLElement).innerText?.slice(0, 50) ?? ''}`);
    });

test.describe('Popup — texte long intégralement visible', () => {
    test('une option trop longue est affichée en entier (retour à la ligne, pas de troncature)', async ({
        mockedPage: page,
    }) => {
        await page.route('**/api/sql/getTransactions**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ transactions: [paidTx(Date.now())] }),
            })
        );
        await page.route('**/api/sql/dailyClosure**', (route) => {
            const req = route.request();
            const url = new URL(req.url());
            if (req.method() === 'POST') {
                const body = JSON.parse(req.postData() || '{}');
                if (body.auto) {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
                }
                return route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: LONG_ERROR, code: 'PERIOD_SEALED' }),
                });
            }
            if (url.searchParams.get('date')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ closure: null }),
                });
            }
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ closures: [{ closure_date: expectedClosureTarget() }] }),
            });
        });

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        // Z menu → manual day closure refused with a long server message.
        const ticketCounter = page.getByText(/Ticket :\s*\d+\s*vente/).first();
        await expect(ticketCounter).toBeVisible({ timeout: 15000 });
        await ticketCounter.dispatchEvent('contextmenu');
        await page.getByText('Clôturer la caisse').click();

        const popup = page.locator('#popup');
        const option = popup.locator('[role=option]', { hasText: 'Le mois 2026-09 est clôturé' });
        await expect(option).toBeVisible({ timeout: 5000 });
        // The FULL message must be rendered — the option's text is complete
        // and nothing inside the popup overflows its box horizontally.
        await expect(option).toContainText(LONG_ERROR);
        expect(await clippedNodes(popup)).toEqual([]);
    });

    test('jour/mois clôturé : titre explicite et un seul bouton OK', async ({ mockedPage: page }) => {
        await page.route('**/api/sql/saveTransaction', (route) =>
            route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: "Le mois 2026-09 est clôturé — l'écriture a été refusée",
                    code: 'DAY_CLOSED',
                    closedDay: new Date().toISOString().slice(0, 10),
                }),
            })
        );

        await page.goto('/');
        await page.getByText('Boissons').first().click();
        await expect(page.getByText('Coca')).toBeVisible({ timeout: 15000 });
        await page.getByText('Coca').click();
        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();
        await expect(page.getByText('Carte Bancaire')).toBeVisible({ timeout: 5000 });
        await page.getByText('Carte Bancaire').click();

        const popup = page.locator('#popup');
        // The explicit reason sits in the title and the only action is OK —
        // the message is no longer split across look-alike options.
        await expect(popup).toContainText('Le mois 2026-09 est clôturé', { timeout: 10000 });
        await expect(popup).toContainText('transaction conservée sur cet appareil');
        const options = popup.locator('[role=option]');
        await expect(options).toHaveCount(1);
        await expect(options.first()).toHaveText('OK');
        expect(await clippedNodes(popup)).toEqual([]);
    });
});
