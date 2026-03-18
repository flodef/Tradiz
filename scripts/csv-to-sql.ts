/**
 * CSV → SQL generator for Tradiz
 *
 * Reads "Pause Iodée - Produits.csv" and produces INSERT statements for the
 * `categorie` and `article` tables.
 *
 * Merging rules:
 *   Articles whose name shares the same prefix (everything before the last
 *   "variant" token, e.g. volume "25cl", "33cl", size "x1"/"x3") are merged
 *   into a single article row with an `options` JSON column.
 *
 *   The first word must NOT be a French article (Le, La, Les, L').
 *
 *   When merged, the article base price is set to 0 and each variant carries
 *   its own price in the options JSON.
 *
 * Usage:  bun run scripts/csv-to-sql.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Parse CSV ───────────────────────────────────────────────────────────────

const csvPath = resolve('/home/flo/Downloads/Pause Iodée - Produits.csv');
const raw = readFileSync(csvPath, 'utf-8');
const lines = raw.trim().split('\n').slice(1); // skip header

interface Row {
    category: string;
    name: string;
    unavailable: boolean;
    priceEur: number;
    priceJune: number;
}

const rows: Row[] = lines
    .filter((l) => l.trim())
    .map((line) => {
        const [category, name, unavailable, eur, june] = line.split(',').map((s) => s.trim());
        return {
            category,
            name,
            unavailable: unavailable === 'TRUE',
            priceEur: parseFloat(eur) || 0,
            priceJune: parseFloat(june) || 0,
        };
    });

// ── Detect variant suffix ────────────────────────────────────────────────────
// Only merge articles when the trailing part after the shared prefix is a
// recognisable size / volume / count token.

const VOLUME_RE = /^\d+\s*(cl|l|ml)$/i;
const COUNT_RE = /^(x\s?\d+|\d+\s*(pers\.?|boules?|boule))$/i;

function isVariantSuffix(suffix: string): boolean {
    const s = suffix.trim();
    return VOLUME_RE.test(s) || COUNT_RE.test(s);
}

function detectOptionType(variants: { valeur: string }[]): string {
    const allVolume = variants.every((v) => VOLUME_RE.test(v.valeur.trim()));
    if (allVolume) return 'Volume';
    const allCount = variants.every((v) => COUNT_RE.test(v.valeur.trim()) || /^\d+$/.test(v.valeur.trim()));
    if (allCount) return 'Quantité';
    return 'Choix';
}

// ── Manual merge overrides ──────────────────────────────────────────────────
// (category → prefix): articles whose name starts with this prefix are merged
// even if the variant part is not a simple volume/count.
const MANUAL_MERGE: { category: string; prefix: string }[] = [
    { category: 'Froid', prefix: 'Breizh' },
    { category: 'Alcools', prefix: 'Kauri' },
    { category: 'Alcools', prefix: 'Pétillant St Charles' },
    { category: 'A croquer', prefix: 'Glace' },
    { category: 'A croquer', prefix: 'Boule d\u2019\u00e9nergie x' },
];

function computePrefix(a: string, b: string): string {
    const aParts = a.split(' ');
    const bParts = b.split(' ');
    const common: string[] = [];
    for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
        if (aParts[i].toLowerCase() === bParts[i].toLowerCase()) {
            common.push(aParts[i]);
        } else break;
    }
    return common.join(' ');
}

// ── Build final articles ────────────────────────────────────────────────────

// Group rows by category
const byCategory = new Map<string, Row[]>();
for (const row of rows) {
    const arr = byCategory.get(row.category) || [];
    arr.push(row);
    byCategory.set(row.category, arr);
}

interface FinalArticle {
    category: string;
    name: string;
    unavailable: boolean;
    priceEur: number;
    priceJune: number;
    options: string | null;
    tva: number;
}

function getTva(category: string): number {
    return category === 'Alcools' ? 20 : 5.5;
}
const finalArticles: FinalArticle[] = [];

for (const [category, catRows] of Array.from(byCategory)) {
    const used = new Set<string>();

    // Pass 1: manual merge overrides
    for (const { category: mCat, prefix } of MANUAL_MERGE) {
        if (mCat !== category) continue;
        const matching = catRows.filter((r: Row) => r.name.startsWith(prefix) && r.name !== prefix);
        if (matching.length < 2) continue;
        for (const r of matching) used.add(r.name);

        const variants = matching.map((r: Row) => ({
            valeur: r.name.substring(prefix.length).trim(),
            prix: r.priceEur.toFixed(2),
        }));
        const anyAvailable = matching.some((r: Row) => !r.unavailable);
        finalArticles.push({
            category,
            name: prefix,
            unavailable: !anyAvailable,
            priceEur: 0,
            priceJune: 0,
            options: JSON.stringify([{ type: detectOptionType(variants), options: variants }]),
            tva: getTva(category),
        });
    }

    // Pass 2: auto-detect volume/count variant groups among remaining items
    const remaining = catRows.filter((r: Row) => !used.has(r.name));

    // Group by longest common prefix
    const prefixGroups = new Map<string, Row[]>();
    for (const row of remaining) {
        let matched = false;
        for (const [pfx, group] of Array.from(prefixGroups)) {
            const cp = computePrefix(pfx, row.name);
            if (cp.length > 0 && cp === pfx) {
                const suffix = row.name.substring(cp.length).trim();
                // Check all existing members also have variant suffixes
                const allVariants = group.every((r: Row) => isVariantSuffix(r.name.substring(cp.length).trim()));
                if (suffix && isVariantSuffix(suffix) && allVariants) {
                    group.push(row);
                    matched = true;
                    break;
                }
            }
        }
        if (!matched) {
            // Try to start a new group — but only if this item itself ends with a variant suffix
            const parts = row.name.split(' ');
            const lastPart = parts[parts.length - 1];
            if (parts.length >= 2 && isVariantSuffix(lastPart)) {
                const pfx = parts.slice(0, -1).join(' ');
                const existing = prefixGroups.get(pfx);
                if (existing) {
                    existing.push(row);
                } else {
                    prefixGroups.set(pfx, [row]);
                }
            } else {
                // Standalone — use full name as key to avoid collisions
                prefixGroups.set(`__solo__${row.name}`, [row]);
            }
        }
    }

    for (const [key, group] of Array.from(prefixGroups)) {
        if (key.startsWith('__solo__') || group.length === 1) {
            // No merge
            for (const r of group) {
                finalArticles.push({
                    category: r.category,
                    name: r.name,
                    unavailable: r.unavailable,
                    priceEur: r.priceEur,
                    priceJune: r.priceJune,
                    options: null,
                    tva: getTva(r.category),
                });
            }
            continue;
        }

        // Merge: base price = 0, options carry individual prices
        const prefix = key;
        const variants = group.map((r: Row) => ({
            valeur: r.name.substring(prefix.length).trim(),
            prix: r.priceEur.toFixed(2),
        }));
        const anyAvailable = group.some((r: Row) => !r.unavailable);
        finalArticles.push({
            category,
            name: prefix,
            unavailable: !anyAvailable,
            priceEur: 0,
            priceJune: 0,
            options: JSON.stringify([{ type: detectOptionType(variants), options: variants }]),
            tva: getTva(category),
        });
    }
}

// ── Generate SQL ────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/'/g, "''");

// Categories
const categories = Array.from(new Set(rows.map((r: Row) => r.category)));
console.log('-- Categories');
console.log('DELETE FROM categorie;');
console.log(
    `INSERT INTO categorie (id, nom, ordre) VALUES\n` +
        categories.map((c, i) => `    ('${i + 1}', '${esc(c)}', ${i + 1})`).join(',\n') +
        ';\n'
);

// Build category ID lookup
const catIdMap = new Map(categories.map((c, i) => [c, String(i + 1)]));

// Articles
console.log('-- Articles');
console.log('DELETE FROM article;');
console.log(
    `INSERT INTO article (ordre, nom, prix, photo, disponible, categorie, description, options, nbr_commandes, taux_tva) VALUES`
);
const articleLines = finalArticles.map((a, i) => {
    const catId = catIdMap.get(a.category) || '1';
    const opts = a.options ? `'${esc(a.options)}'` : "''";
    return `    (${i + 1}, '${esc(a.name)}', ${a.priceEur.toFixed(2)}, '', ${a.unavailable ? 0 : 1}, '${catId}', '', ${opts}, 0, ${a.tva})`;
});
console.log(articleLines.join(',\n') + ';\n');

// Summary
console.log(
    `-- Summary: ${categories.length} categories, ${finalArticles.length} articles (from ${rows.length} CSV rows)`
);
const merged = finalArticles.filter((a) => a.options);
if (merged.length > 0) {
    console.log(`-- Merged articles (${merged.length}):`);
    for (const a of merged) {
        const opts = JSON.parse(a.options!);
        const variants = opts[0].options.map((o: { valeur: string }) => o.valeur).join(', ');
        console.log(`--   ${a.name} → [${variants}]`);
    }
}
