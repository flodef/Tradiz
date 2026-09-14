import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// ── Security E2E: phases A (device key), B (revocation), C (PIN/sessions),
// D (alerts). Server-side enforcement (throttling, hash chains, SQL guards) is
// covered by unit tests — here we verify the client-visible behaviour.

const CONFIG_URL = '/admin/kitchen/config';

const CASHIER = { id: 1, name: 'Marie', role: 'Cashier', reference: 'marie', hasPin: false };
const ADMIN_PINNED = { id: 2, name: 'Admin Boss', role: 'Admin', reference: 'boss', hasPin: true };
const ADMIN_PLAIN = { id: 3, name: 'Admin SansPin', role: 'Admin', reference: 'nopin', hasPin: false };

async function mockUsers(page: Page, users: unknown[]) {
    await page.route('**/api/sql/getUsers', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users }) })
    );
}

async function mockResolveUser(page: Page, user: unknown) {
    await page.route('**/api/sql/resolveUser**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user, noUsers: false }),
        })
    );
}

test.describe('A — Clé appareil', () => {
    test('les appels API du POS portent x-public-key (128 bits, = localStorage)', async ({ mockedPage: page }) => {
        // Drop the fixture's seeded key so the app mints a fresh one — this
        // exercises the real 128-bit generateSecureId() path.
        await page.addInitScript(() => localStorage.removeItem('PublicKey'));
        let capturedKey: string | null = null;
        // Observe without intercepting — the fixture's mock still fulfills.
        page.on('request', (req) => {
            if (req.url().includes('/api/sql/getParameters')) {
                capturedKey = req.headers()['x-public-key'] ?? null;
            }
        });
        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        expect(capturedKey).toMatch(/^[0-9a-f]{32}$/);
        const stored = await page.evaluate(() => localStorage.getItem('PublicKey'));
        expect(stored).toBe(capturedKey);
    });

    test("le site public ne crée ni n'envoie de clé appareil", async ({ page }) => {
        // Remove the key seeded by the global storageState — public visitors
        // must stay anonymous (deviceFetchIfKnown never mints nor sends one).
        await page.addInitScript(() => localStorage.removeItem('PublicKey'));
        const sentKeys: (string | undefined)[] = [];
        // Catch-all FIRST so the specific public mocks registered after win.
        await page.route('**/api/**', (route) => {
            sentKeys.push(route.request().headers()['x-public-key']);
            route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        await page.route('**/api/public/shops', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    shops: [
                        { id: 's1', name: 'Bistro', logo: '', image: '', address: '', zipCode: '75001', city: 'Paris' },
                    ],
                }),
            })
        );

        await page.goto('/site');
        await page.waitForLoadState('networkidle');

        const storedKey = await page.evaluate(() => localStorage.getItem('PublicKey'));
        expect(storedKey).toBeNull();
        expect(sentKeys.length).toBeGreaterThan(0);
        expect(sentKeys.every((k) => k === undefined)).toBe(true);
    });
});

test.describe('B — Révocation', () => {
    test("heartbeat registered:false → rechargement → écran 'Utilisateur non identifié'", async ({
        mockedPage: page,
    }) => {
        let revoked = false;
        await page.route('**/api/sql/heartbeat', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ otherDevices: 0, registered: !revoked }),
            })
        );
        await page.route('**/api/sql/resolveUser**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    user: revoked ? null : { id: 1, name: 'Test User', role: 'Admin', reference: 'test' },
                    noUsers: false,
                }),
            })
        );

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        revoked = true;
        // 'online' triggers a heartbeat immediately instead of waiting for the
        // poll interval. Re-dispatch until one lands outside an in-flight sync.
        await expect(async () => {
            await page.evaluate(() => window.dispatchEvent(new Event('online')));
            // .first() — the dev-mode Next.js error overlay also logs the message.
            await expect(page.getByText('Utilisateur non identifié').first()).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 20000 });
    });
});

test.describe('C — PIN utilisateur et sessions', () => {
    test('switch vers un utilisateur sans PIN : inchangé (pas de saisie)', async ({ mockedPage: page }) => {
        await mockUsers(page, [CASHIER, ADMIN_PLAIN]);
        await mockResolveUser(page, CASHIER);
        await page.route('**/api/sql/logoutUser', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
        );

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        await page.getByText('Marie').first().click();
        await expect(page.getByText("Changer d'utilisateur")).toBeVisible();
        await page.getByText('Admin SansPin').click();

        // No PIN step — the switch happens immediately and the popup closes.
        await expect(page.getByText('Code PIN')).toHaveCount(0);
        await expect(page.getByText("Changer d'utilisateur")).toHaveCount(0);
    });

    test('switch vers un utilisateur avec PIN : saisie, erreur, puis session créée', async ({ mockedPage: page }) => {
        await mockUsers(page, [CASHIER, ADMIN_PINNED]);
        await mockResolveUser(page, CASHIER);

        let pinOk = false;
        let logoutToken: string | null = null;
        await page.route('**/api/sql/logoutUser', (route) => {
            logoutToken = route.request().headers()['x-user-token'] ?? null;
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        });
        await page.route('**/api/sql/verifyUserPin', async (route) => {
            if (!pinOk) {
                return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Invalid PIN"}' });
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    token: 'e2e-token',
                    expiresAt: new Date(Date.now() + 3600e3).toISOString(),
                }),
            });
        });

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        await page.getByText('Marie').first().click();
        await page.getByText('Admin Boss').click();

        // PIN step appears
        const pinInput = page.getByPlaceholder('Code PIN');
        await expect(pinInput).toBeVisible();

        // Wrong PIN → error
        await pinInput.fill('0000');
        await page.getByRole('button', { name: 'Valider' }).click();
        await expect(page.getByText('PIN incorrect.')).toBeVisible();

        // Right PIN → session stored + user switched. 'Admin Boss' is already
        // visible in the PIN-step header, so wait for the popup to close.
        pinOk = true;
        await pinInput.fill('1234');
        await page.getByRole('button', { name: 'Valider' }).click();
        await expect(pinInput).toHaveCount(0, { timeout: 5000 });

        const session = await page.evaluate(() => localStorage.getItem('tradiz-user-session'));
        expect(session).not.toBeNull();
        expect(JSON.parse(session!)).toMatchObject({ userId: 2, token: 'e2e-token' });

        // Switching back to a PIN-less user revokes the session: logoutUser
        // receives the x-user-token header and the local session is cleared.
        await page.getByText('Admin Boss').first().click();
        await page.getByText('Marie').click();
        await expect(page.getByText("Changer d'utilisateur")).toHaveCount(0);
        expect(logoutToken).toBe('e2e-token');
        expect(await page.evaluate(() => localStorage.getItem('tradiz-user-session'))).toBeNull();
    });

    test('un utilisateur à PIN n’est pas restauré sans session valide', async ({ mockedPage: page }) => {
        await mockUsers(page, [CASHIER, ADMIN_PINNED]);
        await mockResolveUser(page, CASHIER);
        await page.addInitScript(() => {
            localStorage.setItem(
                'CurrentUser',
                JSON.stringify({ id: 2, name: 'Admin Boss', role: 'Admin', reference: 'boss' })
            );
        });

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });

        // Current user stays the device's user (Marie) — the persisted PIN'd
        // user is NOT silently restored.
        await expect(page.getByText('Marie').first()).toBeVisible();
        await expect(page.getByText('Admin Boss')).toHaveCount(0);
    });

    test('un utilisateur à PIN est restauré quand une session valide existe', async ({ mockedPage: page }) => {
        await mockUsers(page, [CASHIER, ADMIN_PINNED]);
        await mockResolveUser(page, CASHIER);
        await page.addInitScript(() => {
            localStorage.setItem(
                'CurrentUser',
                JSON.stringify({ id: 2, name: 'Admin Boss', role: 'Admin', reference: 'boss' })
            );
            localStorage.setItem(
                'tradiz-user-session',
                JSON.stringify({ userId: 2, token: 'tok', expiresAt: new Date(Date.now() + 3600e3).toISOString() })
            );
        });

        await page.goto('/');
        await expect(page.getByText('Boissons').first()).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Admin Boss').first()).toBeVisible();
    });

    test('requireUserAuth : la page admin exige le PIN, puis s’ouvre après vérification', async ({
        mockedPage: page,
    }) => {
        await mockUsers(page, [CASHIER, ADMIN_PINNED]);
        // Seed the cached Config so useConfig().users is populated on the admin
        // page (DeviceGate's PIN prompt reads it). Literals only — addInitScript
        // is serialized and runs in the page context, closures don't carry.
        await page.addInitScript(() => {
            localStorage.setItem(
                'Config',
                JSON.stringify({
                    parameters: { user: { id: 1, name: 'Marie', role: 'Cashier', reference: 'marie' } },
                    currencies: [],
                    paymentMethods: [],
                    inventory: [],
                    discounts: [],
                    colors: [],
                    printers: [],
                    customers: [],
                    users: [
                        { id: 1, name: 'Marie', role: 'Cashier', reference: 'marie', hasPin: false },
                        { id: 2, name: 'Admin Boss', role: 'Admin', reference: 'boss', hasPin: true },
                    ],
                })
            );
        });

        // whoami : admin only once a session token is presented
        await page.route('**/api/sql/whoami**', (route) => {
            const hasToken = !!route.request().headers()['x-user-token'];
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    authorized: true,
                    admin: hasToken,
                    deviceAdmin: true,
                    intervention: false,
                    role: 'Admin',
                    requiresUserAuth: true,
                    session: hasToken ? { userId: 2, name: 'Admin Boss', role: 'Admin' } : null,
                }),
            });
        });
        await page.route('**/api/sql/verifyUserPin', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    token: 'e2e-token',
                    expiresAt: new Date(Date.now() + 3600e3).toISOString(),
                }),
            })
        );

        await page.goto(CONFIG_URL);

        // Gate blocks the page and shows the admin PIN prompt
        await expect(page.getByText('Authentification administrateur')).toBeVisible({ timeout: 20000 });
        await page.getByText('Admin Boss').click();
        await page.getByPlaceholder('Code PIN').fill('1234');
        await page.getByRole('button', { name: 'Valider' }).click();

        // After the session is created, the probe succeeds and sections render
        await expect(page.getByText('Paramètres', { exact: true })).toBeVisible({ timeout: 10000 });
    });

    test("le switch 'Exiger le PIN pour l'administration' est désactivé sans PIN admin", async ({
        mockedPage: page,
    }) => {
        await mockUsers(page, [CASHIER, ADMIN_PLAIN]);
        await page.goto(CONFIG_URL);

        await page.getByText('Paramètres', { exact: true }).click();
        const toggleLabel = page.locator('label', { hasText: "Exiger le PIN pour l'administration" });
        await expect(toggleLabel).toBeVisible({ timeout: 15000 });
        await expect(toggleLabel.locator('input[type="checkbox"]')).toBeDisabled();
        await expect(page.getByText("Définissez d'abord un PIN sur un utilisateur Admin")).toBeVisible();
    });

    test("le switch 'Exiger le PIN pour l'administration' est activable avec un PIN admin", async ({
        mockedPage: page,
    }) => {
        await mockUsers(page, [CASHIER, ADMIN_PINNED]);
        await page.goto(CONFIG_URL);

        await page.getByText('Paramètres', { exact: true }).click();
        const toggleLabel = page.locator('label', { hasText: "Exiger le PIN pour l'administration" });
        await expect(toggleLabel).toBeVisible({ timeout: 15000 });
        await expect(toggleLabel.locator('input[type="checkbox"]')).toBeEnabled();
    });
});

test.describe('D — Alertes', () => {
    test('appareil inconnu détecté → bannière dans la section Appareils', async ({ mockedPage: page }) => {
        await page.route('**/api/sql/getFailedLoginKey', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ key: 'deadbeef'.repeat(4), at: new Date().toISOString() }),
            })
        );
        await mockUsers(page, [CASHIER]);

        await page.goto(CONFIG_URL);
        await page.getByText('Appareils', { exact: true }).click();

        await expect(page.getByText('Un appareil inconnu a tenté de se connecter')).toBeVisible({
            timeout: 15000,
        });
        await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

        // The new row is prefilled with the unknown key
        await expect(page.locator(`input[value="${'deadbeef'.repeat(4)}"]`)).toBeVisible();
    });
});
