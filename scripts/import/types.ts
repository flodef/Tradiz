/**
 * Shared types and data-mapping helpers for the Firestore → SQL importers.
 */

// ── Firestore data shapes ────────────────────────────────────────────────────

export interface FirestoreDiscount {
    unity?: string;
    unit?: string;
    value?: number;
    amount?: number;
}

export interface FirestoreProduct {
    label: string;
    category: string;
    amount: number;
    quantity: number;
    total: number;
    discount: FirestoreDiscount;
    options?: string;
}

export interface FirestoreTransaction {
    method: string;
    currency: string;
    amount: number;
    createdDate: number;
    modifiedDate: number;
    validator: string;
    products: FirestoreProduct[];
    note?: string;
}

/** One day's worth of transactions, as stored in a Firestore collection. */
export interface TransactionSet {
    id: string; // collection name, e.g. "pauseiodee_2025-03-14"
    transactions: FirestoreTransaction[];
}

// ── Payment method mapping ───────────────────────────────────────────────────

export const PAYMENT_METHOD_MAP: Record<string, string> = {
    Espèce: 'Espèce',
    'Carte Bancaire': 'Carte Bancaire',
    Chèque: 'Chèque',
};

export const SKIP_METHODS = new Set(['EFFACÉE']);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert epoch-millis to a SQL-friendly datetime string (UTC). */
export function msToDatetime(ms: number): string {
    const d = new Date(ms);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ── CLI parsing ──────────────────────────────────────────────────────────────

export interface CliArgs {
    mode: 'shop' | 'file';
    value: string; // shop name or file path
    dryRun: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
    const args = argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const filtered = args.filter((a) => a !== '--dry-run');

    // --shop <name>
    const shopIdx = filtered.indexOf('--shop');
    if (shopIdx !== -1 && filtered[shopIdx + 1]) {
        return { mode: 'shop', value: filtered[shopIdx + 1], dryRun };
    }

    // --file <path>
    const fileIdx = filtered.indexOf('--file');
    if (fileIdx !== -1 && filtered[fileIdx + 1]) {
        return { mode: 'file', value: filtered[fileIdx + 1], dryRun };
    }

    // Legacy: bare positional arg = file path
    const positional = filtered.find((a) => !a.startsWith('--'));
    if (positional) {
        return { mode: 'file', value: positional, dryRun };
    }

    console.error(
        'Usage:\n' +
            '  bun run <script> --shop <shopname> [--dry-run]\n' +
            '  bun run <script> --file <path.json> [--dry-run]'
    );
    process.exit(1);
}
