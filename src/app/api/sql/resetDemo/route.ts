import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getPosDb, withTransaction, type DbConnection } from '../db';

export const dynamic = 'force-dynamic';

const DEMO_SHOP = 'demo';

/**
 * Splits a SQL script into executable statements, respecting single-quoted
 * strings ('' escapes), dollar-quoted blocks ($tag$…$tag$ — required for the
 * DO blocks in the seed) and line/block comments, which are stripped. The route
 * wraps everything in its own transaction, so BEGIN/COMMIT markers are dropped.
 */
function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let buf = '';
    let i = 0;
    const n = sql.length;
    while (i < n) {
        const ch = sql[i];
        if (ch === '-' && sql[i + 1] === '-') {
            const nl = sql.indexOf('\n', i);
            i = nl === -1 ? n : nl;
            continue;
        }
        if (ch === '/' && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            i = end === -1 ? n : end + 2;
            continue;
        }
        if (ch === "'") {
            let j = i + 1;
            while (j < n) {
                if (sql[j] === "'") {
                    if (sql[j + 1] === "'") {
                        j += 2;
                        continue;
                    }
                    j++;
                    break;
                }
                j++;
            }
            buf += sql.slice(i, j);
            i = j;
            continue;
        }
        if (ch === '$') {
            const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
            if (tag) {
                const end = sql.indexOf(tag, i + tag.length);
                const j = end === -1 ? n : end + tag.length;
                buf += sql.slice(i, j);
                i = j;
                continue;
            }
        }
        if (ch === ';') {
            const stmt = buf.trim();
            if (stmt) statements.push(stmt);
            buf = '';
            i++;
            continue;
        }
        buf += ch;
        i++;
    }
    const last = buf.trim();
    if (last) statements.push(last);
    return statements.filter((s) => s !== 'BEGIN' && s !== 'COMMIT');
}

function loadStatements(fileName: string): string[] {
    return splitSqlStatements(fs.readFileSync(path.join(process.cwd(), 'scripts', fileName), 'utf-8'));
}

/**
 * Wipes tester data and re-seeds the demo shop in a single transaction.
 * Not device-gated on purpose: testers clicking the demo button are not
 * registered devices — and the reset is the desired outcome anyway.
 */
async function resetDemoDb(shopId: string): Promise<void> {
    const statements = [...loadStatements('reset-demo.sql'), ...loadStatements('seed-demo-data.sql')];
    const connection: DbConnection = await getPosDb(shopId);
    try {
        await withTransaction(connection, async () => {
            // Serialize resets: two testers clicking the demo button at the
            // same time must not interleave their DELETE/INSERT batches.
            if (connection.isPostgreSQL) {
                await connection.execute('SELECT pg_advisory_xact_lock(72756)');
                // The demo wipe DELETEs append-only fiscal tables — suspend
                // the NF525 no-delete/no-update triggers for this transaction.
                // USER (not ALL) keeps system triggers — including foreign-key
                // enforcement — active during the wipe.
                for (const table of [
                    'dc_pos.audit_events',
                    'dc_pos.product_price_history',
                    'dc_pos.balance_history',
                    'dc_pos.daily_closures',
                    'dc_pos.monthly_closures',
                    'dc_pos.annual_closures',
                    'dc_pos.subscription_events',
                    'dc_pos.transactions',
                ]) {
                    await connection.execute(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
                }
            }
            for (const statement of statements) {
                await connection.execute(statement);
            }
            if (connection.isPostgreSQL) {
                for (const table of [
                    'dc_pos.audit_events',
                    'dc_pos.product_price_history',
                    'dc_pos.balance_history',
                    'dc_pos.daily_closures',
                    'dc_pos.monthly_closures',
                    'dc_pos.annual_closures',
                    'dc_pos.subscription_events',
                    'dc_pos.transactions',
                ]) {
                    await connection.execute(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
                }
            }
        });
    } finally {
        await connection.end();
    }
}

function forbidden() {
    return NextResponse.json({ error: 'Not available on this shop' }, { status: 403 });
}

/** POST /api/sql/resetDemo — JSON API (scripts, clients). */
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    if (shopId !== DEMO_SHOP) return forbidden();
    try {
        await resetDemoDb(shopId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error resetting demo:', error);
        return NextResponse.json({ error: 'An error occurred while resetting the demo' }, { status: 500 });
    }
}

/**
 * GET /api/sql/resetDemo — used by the landing page's demo buttons:
 * navigates here, resets the demo, then redirects to the fresh shop.
 * Direct access to the demo URL never touches this route.
 */
export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    if (shopId !== DEMO_SHOP) return forbidden();
    try {
        await resetDemoDb(shopId);
        return NextResponse.redirect(new URL('/', request.url));
    } catch (error) {
        console.error('Error resetting demo:', error);
        return NextResponse.json({ error: 'An error occurred while resetting the demo' }, { status: 500 });
    }
}
