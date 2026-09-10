/**
 * Generate import-annette-data.sql from API JSON exports.
 * Reads JSON files from /tmp/annette-export/ and produces
 * an idempotent SQL import script matching the format of import-gds-data.sql.
 *
 * Usage: bun scripts/generate-import-sql.ts
 */

export {};

const INPUT_DIR = '/tmp/annette-export';
const OUTPUT_FILE = 'scripts/import-annette-data.sql';

// Use fetch API (available in Bun) to read local files via file:// or just use Bun.file
// We use a dynamic import to avoid needing @types/bun or @types/node
async function readFileText(path: string): Promise<string> {
    // @ts-expect-error — Bun.file is available at runtime in Bun
    return await Bun.file(path).text();
}

async function readJson<T>(name: string): Promise<T> {
    return JSON.parse(await readFileText(`${INPUT_DIR}/${name}`)) as T;
}

function sqlEscape(value: string | null | undefined): string {
    if (value === null || value === undefined) return 'NULL';
    return `'${value.replace(/'/g, "''")}'`;
}

// ─── Fetch data ───
interface Parameter {
    key: string;
    value: string;
}
interface User {
    id: number;
    name: string;
    role: string;
    reference: string;
}
interface PaymentMethod {
    type: string;
    id: string;
    currency: string;
    availability: boolean;
}
interface Device {
    id: number;
    label: string;
    key: string;
    userId: number;
    backscreenCom: string | null;
    backscreenBaud: string | null;
    printerCom: string | null;
    printerBaud: string | null;
    cashDrawerCom: string | null;
    cashDrawerBaud: string | null;
}
interface Category {
    id: number;
    name: string;
    company: string | null;
    printer: string | null;
    sortOrder: number;
}
interface Product {
    rate: number;
    category: string;
    label: string;
    stock: number | null;
    reference: string;
    photo: string;
    description: string;
    color: string;
    prices: number[];
    options: unknown;
    sortOrder: number;
    employerShare: number | null;
}
interface ThemeColor {
    label: string;
    light: string;
    dark: string;
}
interface ColorsResponse {
    colors: ThemeColor[];
    themeNames: string[];
    selectedThemeIndex: number;
}

async function main() {
    const parameters = (await readJson<{ parameters: Parameter[] }>('getParameters.json')).parameters;
    const users = (await readJson<{ users: User[] }>('getUsers.json')).users;
    const paymentMethods = (await readJson<{ paymentMethods: PaymentMethod[] }>('getPaymentMethods.json'))
        .paymentMethods;
    const devices = (await readJson<{ devices: Device[] }>('getDevices.json')).devices;
    const categories = (await readJson<{ categories: Category[] }>('getCategories.json')).categories;
    const products = (await readJson<{ products: Product[] }>('getAllArticles.json')).products;
    const colors = await readJson<ColorsResponse>('getColors.json');

    // ─── Generate SQL ───
    let sql = `-- ============================================================
-- Annette (Le pain d'Annette) Data Import Script
-- Auto-generated from live DB on ${new Date().toISOString()}
--
-- This script is IDEMPOTENT: it uses ON CONFLICT DO NOTHING
-- and can be safely rerun without creating duplicates.
-- ============================================================

BEGIN;

-- ============================================================
-- Ensure unique constraint on formulas (name, price) for idempotency
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_formulas_name_price' AND table_schema = 'dc' AND table_name = 'formulas'
    ) THEN
        ALTER TABLE dc.formulas ADD CONSTRAINT uq_formulas_name_price UNIQUE (name, price);
    END IF;
END $$;

-- ============================================================
-- Live DB data (exported from current database)
-- Users, Parameters, Payment methods, Devices, Themes
-- ============================================================

`;

    // ─── Users ───
    sql += `-- Users (cashiers)\n`;
    for (let i = 0; i < users.length; i++) {
        const u = users[i];
        sql += `INSERT INTO dc_pos.users (id, name, role, reference, created_at) VALUES (${u.id}, ${sqlEscape(u.name)}, ${sqlEscape(u.role)}, ${sqlEscape(u.reference)}, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += '\n';

    // ─── Parameters ───
    sql += `-- Parameters (paramètres)\n`;
    for (let i = 0; i < parameters.length; i++) {
        const p = parameters[i];
        // Skip large base64 images — they're handled separately
        if (p.key === 'logo' || p.key === 'shopImage') {
            sql += `INSERT INTO dc_pos.parameters (id, param_key, param_value, updated_at) VALUES (${i + 1}, ${sqlEscape(p.key)}, NULL, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;\n`;
            continue;
        }
        sql += `INSERT INTO dc_pos.parameters (id, param_key, param_value, updated_at) VALUES (${i + 1}, ${sqlEscape(p.key)}, ${sqlEscape(p.value)}, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += '\n';

    // ─── Payment methods ───
    sql += `-- Payment methods (paiements)\n`;
    for (let i = 0; i < paymentMethods.length; i++) {
        const pm = paymentMethods[i];
        sql += `INSERT INTO dc_pos.payment_methods (id, label, address, currency, available, created_at) VALUES (${i + 1}, ${sqlEscape(pm.type)}, ${sqlEscape(pm.id)}, ${sqlEscape(pm.currency)}, ${pm.availability}, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += '\n';

    // ─── Printers ───
    sql += `-- Printers (imprimantes)\n`;
    sql += `-- No printers configured for this shop\n\n`;

    // ─── Devices ───
    if (devices.length > 0) {
        sql += `-- Devices (appareils) — references users\n`;
        for (const d of devices) {
            sql += `INSERT INTO dc_pos.devices (id, label, public_key, user_id, connected, last_seen, created_at) VALUES (${d.id}, ${sqlEscape(d.label)}, ${sqlEscape(d.key)}, ${d.userId}, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;\n`;
        }
        sql += '\n';
    }

    // ─── Companies ───
    sql += `-- Companies\n`;
    sql += `-- No companies configured for this shop\n\n`;

    // ─── Customers ───
    sql += `-- Customers\n`;
    sql += `-- No customers configured for this shop\n\n`;

    // ─── Themes ───
    sql += `-- Themes\n`;
    const themeColors = colors.colors;
    if (themeColors.length >= 7) {
        const cols = [
            'text_light',
            'text_dark',
            'gradient_start_light',
            'gradient_start_dark',
            'gradient_end_light',
            'gradient_end_dark',
            'popup_light',
            'popup_dark',
            'activated_light',
            'activated_dark',
            'secondary_light',
            'secondary_dark',
            'secondary_activated_light',
            'secondary_activated_dark',
        ];
        const vals: string[] = [];
        for (let i = 0; i < 7; i++) {
            vals.push(sqlEscape(themeColors[i].light));
            vals.push(sqlEscape(themeColors[i].dark));
        }
        sql += `INSERT INTO dc.theme_admin (selected, name, ${cols.join(', ')}) VALUES (true, ${sqlEscape(colors.themeNames[0] || 'Défaut')}, ${vals.join(', ')}) ON CONFLICT DO NOTHING;\n`;
    }
    sql += '\n';

    // ─── Categories ───
    sql += `-- ============================================================\n`;
    sql += `-- Categories\n`;
    sql += `-- ============================================================\n`;
    for (const c of categories) {
        sql += `INSERT INTO dc.categories (id, name, sort_order, company_id) VALUES (${c.id}, ${sqlEscape(c.name)}, ${c.sortOrder}, ${sqlEscape(c.company)}) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += '\n';

    // ─── Products ───
    sql += `-- ============================================================\n`;
    sql += `-- Products\n`;
    sql += `-- ============================================================\n`;
    for (const p of products) {
        // Find category ID by name
        const cat = categories.find((c) => c.name === p.category);
        if (!cat) continue;

        const vatRate = (p.rate * 100).toFixed(1);
        const price = p.prices[0] ?? 0;
        const stock = p.stock !== null ? `, ${p.stock}` : '';
        const stockCol = p.stock !== null ? ', stock' : '';
        const photo = p.photo ? `, ${sqlEscape(p.photo)}` : '';
        const photoCol = p.photo ? ', photo' : '';
        const desc = p.description ? `, ${sqlEscape(p.description)}` : '';
        const descCol = p.description ? ', description' : '';
        const color = p.color ? `, ${sqlEscape(p.color)}` : '';
        const colorCol = p.color ? ', color' : '';
        const employerShare = p.employerShare !== null ? `, ${p.employerShare}` : '';
        const employerShareCol = p.employerShare !== null ? ', employer_share' : '';

        sql += `INSERT INTO dc.products (sort_order, name, price, reference, category_id, vat_rate${stockCol}${photoCol}${descCol}${colorCol}${employerShareCol}) VALUES (${p.sortOrder}, ${sqlEscape(p.label)}, ${price}, ${sqlEscape(p.reference)}, ${cat.id}, ${vatRate}${stock}${photo}${desc}${color}${employerShare}) ON CONFLICT (reference) DO NOTHING;\n`;
    }
    sql += '\n';

    sql += `COMMIT;\n`;

    // @ts-expect-error — Bun.write is available at runtime in Bun
    await Bun.write(OUTPUT_FILE, sql);
    console.log(`✓ Written ${sql.length} bytes to ${OUTPUT_FILE}`);
    console.log(`  Parameters: ${parameters.length}`);
    console.log(`  Users: ${users.length}`);
    console.log(`  Payment methods: ${paymentMethods.length}`);
    console.log(`  Devices: ${devices.length}`);
    console.log(`  Categories: ${categories.length}`);
    console.log(`  Products: ${products.length}`);
    console.log(`  Themes: 1 (Défaut)`);
}

main().catch((err) => {
    console.error('Error:', err);
    throw err;
});
