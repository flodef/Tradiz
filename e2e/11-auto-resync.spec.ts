import { test, expect } from './fixtures';

// A transaction whose server push failed must be retried automatically by
// the sync loop — no cashier action, no data loss. Two complementary paths:
//   1. the pendingSync flag retries a failed sale on the next sync cycle,
//   2. the reconcile sweep pushes day-files the server is missing entirely
//      (transactions stranded by older code or a since-repaired closure).

const today = () => new Date().toISOString().slice(0, 10);

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

test.describe('Resynchronisation automatique', () => {
    test('un encaissement refusé par le serveur est repoussé seul au cycle suivant', async ({ mockedPage: page }) => {
        const savePosts: { action?: string; transaction?: { order_id?: string; payment_method?: string } }[] = [];
        let serverDown = true;
        await page.route('**/api/sql/saveTransaction', (route) => {
            savePosts.push(JSON.parse(route.request().postData() || '{}'));
            if (serverDown) {
                return route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: '{"error":"server unavailable"}',
                });
            }
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
        });
        await page.route('**/api/sql/getTransactions**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ transactions: [], serverNow: new Date().toISOString() }),
            })
        );
        await page.route('**/api/sql/getAvailableDates**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ dates: [], counts: {} }),
            })
        );
        await page.route('**/api/sql/heartbeat', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"otherDevices":0}' })
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

        // The sale's push failed — at least one POST hit the dead server.
        await expect
            .poll(() => savePosts.some((p) => p.transaction?.payment_method === 'Carte Bancaire'), { timeout: 10000 })
            .toBe(true);

        // Server recovers. The next sync cycle (triggered here by the online
        // event) must push the flagged transaction without any user action.
        serverDown = false;
        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        await expect
            .poll(() => savePosts.filter((p) => p.transaction?.payment_method === 'Carte Bancaire').length, {
                timeout: 15000,
            })
            .toBeGreaterThan(1);
    });

    test('un jour local absent du serveur est poussé par la réconciliation', async ({ mockedPage: page }) => {
        const savePosts: { action?: string; transaction?: { order_id?: string; created_at?: string } }[] = [];
        await page.route('**/api/sql/saveTransaction', (route) => {
            savePosts.push(JSON.parse(route.request().postData() || '{}'));
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
        });
        await page.route('**/api/sql/getTransactions**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ transactions: [], serverNow: new Date().toISOString() }),
            })
        );
        // The server knows about today only — the old day-file seeded below is
        // missing entirely (transactions stranded by a since-repaired seal).
        let datesCalls = 0;
        await page.route('**/api/sql/getAvailableDates**', (route) => {
            datesCalls++;
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ dates: [today()], counts: { [today()]: 1 } }),
            });
        });
        await page.route('**/api/sql/heartbeat', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"otherDevices":0}' })
        );

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });
        // Wait for the startup sync + reconcile to finish before seeding —
        // a second sync fired while syncInProgress is set would be skipped.
        await expect.poll(() => datesCalls, { timeout: 15000 }).toBeGreaterThan(0);
        await page.waitForTimeout(500);

        // Seed a stranded transaction into an OLD day file — outside the
        // incremental push window and outside today's file.
        const oldDay = daysAgo(3);
        const stranded = paidTx(new Date(`${oldDay}T12:00:00`).getTime());
        stranded.orderId = `stranded-${stranded.createdDate}`;
        await page.evaluate(
            ([key, tx]) =>
                new Promise<void>((resolve, reject) => {
                    const req = indexedDB.open('TradizTransactions', 1);
                    req.onupgradeneeded = () => req.result.createObjectStore('transactions');
                    req.onsuccess = () => {
                        const t = req.result.transaction('transactions', 'readwrite');
                        t.objectStore('transactions').put([tx], key);
                        t.oncomplete = () => resolve();
                        t.onerror = () => reject(t.error);
                    };
                    req.onerror = () => reject(req.error);
                }),
            [`annette_${oldDay}`, stranded] as const
        );

        // Reconnect → reconcile sweep detects the server has 0 rows for that
        // day while the local file has 1, and pushes it. If the online-fired
        // sync overlaps the startup one, the next 15s interval tick runs it —
        // allow for that.
        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        await expect
            .poll(() => savePosts.some((p) => p.transaction?.order_id === stranded.orderId), { timeout: 30000 })
            .toBe(true);
    });
});
