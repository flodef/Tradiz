import { test, expect } from './fixtures';

// Same business-day model as 08-closure.spec.ts — closingHour = 23 in
// mockParameters, so the auto sweep seals every open calendar day up to the
// day before the last boundary.
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

test.describe('Clôture — durcissement (audit)', () => {
    test("la clôture auto envoie un redate_to daté de l'heure locale du poste", async ({ mockedPage: page }) => {
        const target = expectedClosureTarget();
        const posts: { auto?: boolean; redate_to?: string }[] = [];
        await page.route('**/api/sql/dailyClosure**', (route) => {
            const req = route.request();
            if (req.method() === 'POST') {
                posts.push(JSON.parse(req.postData() || '{}'));
                return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
            }
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
        await expect.poll(() => posts.length, { timeout: 10000 }).toBeGreaterThan(0);

        const auto = posts.find((p) => p.auto === true);
        expect(auto?.redate_to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        // The timestamp is the device's LOCAL day — drafts land on the open
        // day the cashier sees, not on the server's UTC day.
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(auto?.redate_to?.slice(0, 10)).toBe(today);
    });

    test('PENDING_DRAFTS ne scelle pas le jour : le brouillon reste synchronisable (push SQL émis)', async ({
        mockedPage: page,
    }) => {
        const target = expectedClosureTarget();
        const prev = (() => {
            const t = new Date(`${target}T12:00:00`);
            t.setDate(t.getDate() - 1);
            return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        })();
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const savePosts: string[] = [];
        await page.route('**/api/sql/saveTransaction', (route) => {
            savePosts.push(route.request().postData() || '');
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
        });
        await page.route('**/api/sql/getTransactions**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ transactions: [paidTx(Date.now())] }),
            })
        );
        const autoPosts: { date?: string }[] = [];
        await page.route('**/api/sql/dailyClosure**', (route) => {
            const req = route.request();
            const url = new URL(req.url());
            if (req.method() === 'POST') {
                const body = JSON.parse(req.postData() || '{}');
                autoPosts.push(body);
                // The day can't be sealed — a draft still sits on it.
                return route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'brouillon', code: 'PENDING_DRAFTS', draftCount: 1 }),
                });
            }
            if (url.searchParams.get('date')) {
                // Per-day existence check (isDayClosed): nothing is closed.
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ closure: null }),
                });
            }
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ closures: [{ closure_date: prev }] }),
            });
        });

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });
        // The auto sweep ran and was refused — the day must NOT be cached as
        // sealed, or the blocking draft becomes unmanageable.
        await expect.poll(() => autoPosts.length, { timeout: 10000 }).toBeGreaterThan(0);
        await page.waitForTimeout(300); // let the client settle after the sweep

        // Now seed a draft dated on the refused day into today's IndexedDB
        // file (done post-load so the startup sync can't push it before the
        // 409 is consumed — that would make the check meaningless).
        const draftDate = new Date(`${target}T12:00:00`).getTime();
        // createdDate on the refused day, modifiedDate now — the incremental
        // push filter keeps only recently-touched local rows. No deviceId:
        // the authoritative merge prunes PROCESSING rows owned by other
        // devices, and the E2E public key is random per session.
        const { deviceId: _deviceId, ...draftBase } = paidTx(draftDate);
        const draftTx = {
            ...draftBase,
            orderId: `draft-${draftDate}`,
            method: 'EN COURS',
            modifiedDate: Date.now(),
        };
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
            [`annette_${today}`, draftTx] as const
        );

        // Trigger the periodic sync immediately via the `online` event: its
        // incremental day-sync pushes recently-modified local rows — unless
        // the day was wrongly cached as sealed, in which case the draft is
        // dropped to a local-only row: no saveTransaction POST.
        await page.route('**/api/sql/heartbeat', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"otherDevices":0}' })
        );
        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        await expect.poll(() => savePosts.some((p) => p.includes(`draft-${draftDate}`)), { timeout: 10000 }).toBe(true);
    });

    test('DAY_CLOSED sur un encaissement → retry unique re-daté avec un order_id neuf', async ({
        mockedPage: page,
    }) => {
        const today = new Date().toISOString().slice(0, 10);
        const savePosts: { action?: string; transaction?: { order_id?: string; created_at?: string } }[] = [];
        await page.route('**/api/sql/saveTransaction', (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            savePosts.push(body);
            // First write for this day: the server sealed it (month/year or a
            // closure the client didn't know about). Retries succeed.
            if (savePosts.length === 1) {
                return route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'clôturé', code: 'DAY_CLOSED', closedDay: today }),
                });
            }
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
        });

        await page.goto('/');
        await page.getByText('Boissons').first().click();
        await expect(page.getByText('Coca')).toBeVisible({ timeout: 15000 });
        await page.getByText('Coca').click();

        const payButton = page.getByText('Payer').first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();
        await expect(page.getByText('Carte Bancaire')).toBeVisible({ timeout: 5000 });
        await page.getByText('Carte Bancaire').click();

        // Two writes: the refused one on the sealed day, then the retry
        // re-dated with a fresh identity (the sealed row keeps the old one).
        await expect.poll(() => savePosts.length, { timeout: 10000 }).toBe(2);
        expect(savePosts[0].transaction?.order_id).toBeTruthy();
        expect(savePosts[1].transaction?.order_id).not.toBe(savePosts[0].transaction?.order_id);
        expect(savePosts[1].transaction?.created_at?.slice(0, 10)).toBe(today);
    });
});

test.describe('PIN et clavier virtuel', () => {
    const users = [
        { id: 1, name: 'Test User', role: 'Admin', reference: 'test' },
        { id: 2, name: 'Pin User', role: 'Cashier', reference: 'pin', hasPin: true },
    ];

    const setupUsers = async (page: import('@playwright/test').Page) => {
        await page.route('**/api/sql/getUsers', (route) => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users }) });
        });
        await page.route('**/api/sql/verifyUserPin', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ token: 'tok', expiresAt: Date.now() + 3600_000 }),
            });
        });
    };

    const openPinScreen = async (page: import('@playwright/test').Page) => {
        await page.goto('/');
        // The current user name is clickable when several users exist.
        const userName = page.getByText('Test User').first();
        await expect(userName).toBeVisible({ timeout: 20000 });
        await userName.click();
        await expect(page.getByText("Changer d'utilisateur")).toBeVisible({ timeout: 5000 });
        await page.getByText('Pin User').click();
        await expect(page.getByPlaceholder('Code PIN')).toBeVisible({ timeout: 5000 });
    };

    test('le bouton Valider exige un PIN de 4 chiffres minimum', async ({ mockedPage: page }) => {
        await setupUsers(page);
        await openPinScreen(page);

        const pinInput = page.getByPlaceholder('Code PIN');
        const validate = page.getByRole('button', { name: 'Valider' });

        // Letters are stripped; 2 digits is not enough to submit.
        await pinInput.fill('12ab');
        await expect(pinInput).toHaveValue('12');
        await expect(validate).toBeDisabled();

        await pinInput.fill('1234');
        await expect(validate).toBeEnabled();
    });

    test('le bouton fermer du clavier virtuel ne recouvre aucune touche', async ({ mockedPage: page }) => {
        await setupUsers(page);
        await page.route('**/api/sql/getParameters', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    parameters: [
                        { key: 'name', value: 'Test Shop' },
                        { key: 'closingHour', value: '23' },
                        { key: 'userSwitch', value: 'true' },
                        { key: 'useVirtualKeyboard', value: 'true' },
                        { key: 'productsSettings', value: '{"useOptions":false,"useStock":true}' },
                        {
                            key: 'displaySettings',
                            value: '{"showChange":true,"showWaiting":true,"showRefund":true,"showDebit":true,"displayOthers":true,"catalogMode":false,"useTakeOut":false,"paymentIconsMode":false}',
                        },
                        { key: 'fidelityRate', value: '0' },
                        {
                            key: 'searchSettings',
                            value: '{"searchCustomers":true,"searchProducts":true,"searchUsers":true}',
                        },
                    ],
                }),
            })
        );
        await openPinScreen(page);

        // Focusing the PIN input (inputMode=numeric) raises the numeric
        // virtual keyboard — the close button sits in its own gutter.
        const keyboard = page.locator('div.fixed.bottom-0').last();
        await expect(keyboard).toBeVisible({ timeout: 5000 });
        const closeBtn = keyboard.getByLabel('Close');
        await expect(closeBtn).toBeVisible();

        const closeBox = await closeBtn.boundingBox();
        expect(closeBox).not.toBeNull();
        const keyButtons = keyboard.locator('button');
        const count = await keyButtons.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
            const box = await keyButtons.nth(i).boundingBox();
            if (!box || !closeBox) continue;
            const overlap = !(
                closeBox.x + closeBox.width <= box.x ||
                box.x + box.width <= closeBox.x ||
                closeBox.y + closeBox.height <= box.y ||
                box.y + box.height <= closeBox.y
            );
            expect(overlap, `close button overlaps key #${i}`).toBe(false);
        }
    });
});
