import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

// ── Smoke test against the REAL dev database ─────────────────────────────
// NOT part of the mocked suite — run it explicitly before each release:
//
//     bun run test:smoke        (i.e. E2E_SMOKE=1 playwright test <this file>)
//
// It opens the real app (no API mocks) wired to the dev DB via .env.local,
// sells an article through the UI, verifies the transaction landed in the
// DB through the API, then expunges it (NF525: the row stays, marked
// SUPPRIMÉE — the audit trail is preserved).
//
// The test registers a dedicated device key in the dev DB at start so it
// survives a dev-DB reset.

const SMOKE_PUBLIC_KEY = 'e2e-smoke-device-7f3a9b2c1d';

function loadEnvLocal(): Record<string, string> {
    const env: Record<string, string> = {};
    const content = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Z_]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^#\s]*))/);
        if (match) env[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    return env;
}

// Same convention as src/app/utils/date.ts — UTC.
const toSQLDateTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

test.describe('Smoke — vente réelle sur la DB dev', () => {
    test.skip(!process.env.E2E_SMOKE, 'Hits the real dev DB — run explicitly via bun run test:smoke');

    test.use({
        storageState: {
            cookies: [],
            origins: [
                {
                    origin: 'http://localhost:3000',
                    localStorage: [{ name: 'PublicKey', value: SMOKE_PUBLIC_KEY }],
                },
            ],
        },
    });

    test.beforeAll(async () => {
        const env = loadEnvLocal();
        const shopId = env.NEXT_PUBLIC_SHOP_ID || env.SHOP_ID;
        expect(shopId, 'NEXT_PUBLIC_SHOP_ID missing in .env.local').toBeTruthy();
        const client = new Client({
            host: env.PG_HOST,
            user: env.PG_USER,
            password: env.PG_PASSWORD,
            database: shopId,
            ssl: { rejectUnauthorized: true },
            connectionTimeoutMillis: 15000,
        });
        await client.connect();
        try {
            // Register the smoke device, linked to the first Admin user, so
            // the app resolves a cashier and the API accepts its writes.
            await client.query(
                `INSERT INTO dc_pos.devices (label, public_key, user_id, connected, created_at)
                 SELECT 'E2E Smoke', $1, u.id, false, NOW()
                 FROM dc_pos.users u WHERE u.role = 'Admin' ORDER BY u.id LIMIT 1
                 ON CONFLICT (public_key) DO NOTHING`,
                [SMOKE_PUBLIC_KEY]
            );
            const { rows } = await client.query<{ user_id: number | null }>(
                `SELECT user_id FROM dc_pos.devices WHERE public_key = $1`,
                [SMOKE_PUBLIC_KEY]
            );
            expect(rows[0]?.user_id, 'smoke device has no linked user — no Admin in dc_pos.users?').toBeTruthy();
        } finally {
            await client.end();
        }
    });

    test('vendre un article, le retrouver en base, puis l’expunger', async ({ page }) => {
        test.setTimeout(120_000); // real dev server — cold compile can be slow
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));

        await page.goto('/', { timeout: 60_000, waitUntil: 'domcontentloaded' });

        // First product tile of the grid (real dev catalog, no options popup —
        // useOptions is off in the dev shop parameters).
        const tile = page.locator('.grid-cols-6 div[lang="fr"]').first();
        await expect(tile, 'no product tile — is the dev catalog empty?').toBeVisible({ timeout: 60000 });
        const productLabel = (await tile.textContent())?.trim();
        await tile.click();

        // Pay → Carte Bancaire (no TPE configured on dev → immediate commit).
        const payButton = page.getByText('Payer', { exact: true }).first();
        await expect(payButton).toBeVisible({ timeout: 5000 });
        await payButton.click();
        const cb = page.getByText('Carte Bancaire', { exact: true }).first();
        await expect(cb).toBeVisible({ timeout: 5000 });

        // Capture the saveTransaction POST — its status IS the check.
        const saveResponse = page.waitForResponse(
            (res) => res.url().includes('/api/sql/saveTransaction') && res.request().method() === 'POST',
            { timeout: 20000 }
        );
        await cb.click();
        const response = await saveResponse;
        expect(response.status(), `saveTransaction failed for "${productLabel}"`).toBe(200);

        const posted = response.request().postDataJSON() as {
            transaction: { order_id: string };
        };
        const orderId = posted.transaction.order_id;
        expect(orderId).toBeTruthy();

        // No error popup may be showing (seal, refusal, TPE error, …).
        const popup = page.locator('#popup');
        if (await popup.isVisible()) {
            await expect(popup).not.toContainText(/clôtur|Erreur|refus/i);
        }

        // The transaction must be readable back from the dev DB.
        const today = new Date().toISOString().slice(0, 10);
        const list = await page.request.get(`/api/sql/getTransactions?period=day&date=${today}&includeDeleted=true`, {
            headers: { 'x-public-key': SMOKE_PUBLIC_KEY },
        });
        expect(list.status()).toBe(200);
        const { transactions } = (await list.json()) as {
            transactions: { orderId?: string; deviceId?: string; method?: string }[];
        };
        const saved = transactions.find((t) => t.orderId === orderId);
        expect(saved, `order_id ${orderId} not found in dev DB`).toBeTruthy();
        expect(saved?.deviceId).toBe(SMOKE_PUBLIC_KEY);

        // Cleanup — expunge via the app's own API (marks the row SUPPRIMÉE,
        // preserving the NF525 audit trail and hash chain).
        const expunge = await page.request.post('/api/sql/saveTransaction', {
            headers: { 'x-public-key': SMOKE_PUBLIC_KEY, 'Content-Type': 'application/json' },
            data: {
                action: 'expunge',
                transaction: {
                    order_id: orderId,
                    user_name: 'E2E Smoke',
                    device_id: SMOKE_PUBLIC_KEY,
                    updated_at: toSQLDateTime(Date.now()),
                },
            },
        });
        expect(expunge.status(), 'expunge failed — manual cleanup needed').toBe(200);

        const verify = await page.request.get(`/api/sql/getTransactions?period=day&date=${today}&includeDeleted=true`, {
            headers: { 'x-public-key': SMOKE_PUBLIC_KEY },
        });
        const { transactions: after } = (await verify.json()) as {
            transactions: { orderId?: string; method?: string }[];
        };
        expect(after.find((t) => t.orderId === orderId)?.method).toBe('SUPPRIMÉE');

        // Fail only on errors related to the sale path — a plain browser
        // (no Electron APIs) can raise benign background noise.
        expect(errors.filter((e) => /clôtur|saveTransaction|expunge|sql/i.test(e))).toEqual([]);
    });
});
