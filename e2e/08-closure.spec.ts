import { test, expect } from './fixtures';

// The auto day-closure seals every open calendar day up to the day before
// the last closingHour boundary (23:00 in mockParameters).
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

test.describe('Clôture de caisse — NF525', () => {
    test('la clôture automatique scelle la veille avec auto=true', async ({ mockedPage: page }) => {
        const target = expectedClosureTarget();
        const posts: { date?: string; auto?: boolean; closed_by?: string }[] = [];
        await page.route('**/api/sql/dailyClosure**', (route) => {
            const req = route.request();
            if (req.method() === 'POST') {
                posts.push(JSON.parse(req.postData() || '{}'));
                return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
            }
            // The day before the target is already closed → the sweep only
            // ever needs to close exactly `target`.
            const t = new Date(`${target}T12:00:00`);
            t.setDate(t.getDate() - 1);
            const prev = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ closures: [{ closure_date: prev }] }),
            });
        });

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        // The effect runs on mount — the auto POST must target the expected day
        await expect.poll(() => posts.length, { timeout: 10000 }).toBeGreaterThan(0);
        const auto = posts.find((p) => p.auto === true);
        expect(auto).toBeTruthy();
        expect(auto?.date).toBe(target);
        expect(auto?.closed_by).toBe('auto');
    });

    test('clôture manuelle refusée tant qu\u2019un brouillon existe (PENDING_DRAFTS)', async ({ mockedPage: page }) => {
        const now = Date.now();
        const posts: { date?: string; auto?: boolean }[] = [];
        await page.route('**/api/sql/getTransactions**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ transactions: [paidTx(now)] }),
            })
        );
        await page.route('**/api/sql/dailyClosure**', (route) => {
            const req = route.request();
            if (req.method() === 'POST') {
                const body = JSON.parse(req.postData() || '{}');
                posts.push(body);
                if (body.auto) {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
                }
                return route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: '1 transaction(s) en cours ou en attente datée(s) du jour — encaissez-les ou annulez-les avant de clôturer',
                        code: 'PENDING_DRAFTS',
                        draftCount: 1,
                    }),
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

        // Right-click the ticket counter ("Ticket : 1 vente") → Z menu
        const ticketCounter = page.getByText(/Ticket :\s*\d+\s*vente/).first();
        await expect(ticketCounter).toBeVisible({ timeout: 15000 });
        await ticketCounter.dispatchEvent('contextmenu');

        await expect(page.getByText('Clôturer la caisse')).toBeVisible({ timeout: 5000 });
        await page.getByText('Clôturer la caisse').click();

        // The server 409 surfaces as a popup — the day stays open
        await expect(page.getByText(/en cours ou en attente/)).toBeVisible({ timeout: 5000 });
        const manual = posts.find((p) => !p.auto);
        expect(manual).toBeTruthy();
    });

    test.describe('mobile', () => {
        test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

        test('suppression d\u2019une vente d\u2019un jour clôturé → refusée côté client', async ({
            mockedPage: page,
        }) => {
            const now = Date.now();
            const today = new Date().toISOString().slice(0, 10);
            let closuresFetched = false;
            const savePosts: string[] = [];
            await page.route('**/api/sql/saveTransaction', (route) => {
                savePosts.push(route.request().postData() || '');
                route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
            });
            await page.route('**/api/sql/getTransactions**', (route) =>
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ transactions: [paidTx(now)] }),
                })
            );
            await page.route('**/api/sql/dailyClosure**', (route) => {
                const req = route.request();
                if (req.method() === 'POST') {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
                }
                // Today AND the sweep target are closed → no auto POST, and the
                // today's transaction is client-side sealed.
                closuresFetched = true;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        closures: [{ closure_date: today }, { closure_date: expectedClosureTarget() }],
                    }),
                });
            });

            await page.goto('/');
            await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });
            // Wait for the closed-days cache seeding so the delete is refused
            // client-side rather than silently pushed.
            await expect.poll(() => closuresFetched, { timeout: 10000 }).toBe(true);
            await page.waitForTimeout(300); // let the client populate closedDaysRef

            // Mobile: tapping the ticket counter opens the transaction list
            const ticketCounter = page.getByText(/Ticket :\s*\d+\s*vente/).first();
            await expect(ticketCounter).toBeVisible({ timeout: 15000 });
            await ticketCounter.click();

            // Long-press (contextmenu) the transaction row → actions menu.
            // dispatchEvent works even though the option reports as hidden.
            const txRow = page.getByText(/en ESPÈCES à/).first();
            await txRow.dispatchEvent('contextmenu');

            // The popup ignores clicks for 400ms after opening (phantom
            // long-press click guard) — wait before selecting an option.
            await expect(page.getByText('Effacer')).toBeVisible({ timeout: 5000 });
            await page.waitForTimeout(500);
            await page.getByText('Effacer').click();

            // Confirm deletion → sealed-day popup instead of a write
            await expect(page.getByText('Continuer')).toBeVisible({ timeout: 5000 });
            await page.waitForTimeout(500);
            await page.getByText('Continuer').click();

            await expect(page.getByText('Journée clôturée')).toBeVisible({ timeout: 5000 });
            // No remote write was attempted — the refusal is client-side.
            expect(savePosts).toHaveLength(0);
        });
    });
});
