import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { createHash } from 'crypto';
import { insertAuditEvent } from '../auditHelpers';

export const dynamic = 'force-dynamic';

interface PeriodTotals {
    ticket_count: number;
    total_amount: number;
    total_ht: number;
    total_tva: number;
    daily_closure_count?: number;
    monthly_closure_count?: number;
}

async function aggregateMonthlyFromDaily(connection: DbConnection, year: number, month: number): Promise<PeriodTotals> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`;

    const query = isPg
        ? `SELECT COUNT(*)::int AS daily_closure_count, COALESCE(SUM(ticket_count), 0)::int AS ticket_count, COALESCE(SUM(total_amount), 0)::numeric AS total_amount, COALESCE(SUM(total_ht), 0)::numeric AS total_ht, COALESCE(SUM(total_tva), 0)::numeric AS total_tva FROM ${prefix}daily_closures WHERE closure_date >= $1 AND closure_date <= $2`
        : `SELECT COUNT(*) AS daily_closure_count, COALESCE(SUM(ticket_count), 0) AS ticket_count, COALESCE(SUM(total_amount), 0) AS total_amount, COALESCE(SUM(total_ht), 0) AS total_ht, COALESCE(SUM(total_tva), 0) AS total_tva FROM ${prefix}daily_closures WHERE closure_date >= ? AND closure_date <= ?`;

    const [rows] = await connection.execute(query, [monthStart, monthEnd]);
    const r = (rows as Record<string, number | string>[])[0];
    return {
        daily_closure_count: Number(r.daily_closure_count) || 0,
        ticket_count: Number(r.ticket_count) || 0,
        total_amount: Number(r.total_amount) || 0,
        total_ht: Number(r.total_ht) || 0,
        total_tva: Number(r.total_tva) || 0,
    };
}

async function aggregateAnnualFromMonthly(connection: DbConnection, year: number): Promise<PeriodTotals> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    // Immutable calendar year (Jan 1 to Dec 31) for audit integrity
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const query = isPg
        ? `SELECT COUNT(*)::int AS monthly_closure_count, COALESCE(SUM(ticket_count), 0)::int AS ticket_count, COALESCE(SUM(total_amount), 0)::numeric AS total_amount, COALESCE(SUM(total_ht), 0)::numeric AS total_ht, COALESCE(SUM(total_tva), 0)::numeric AS total_tva FROM ${prefix}monthly_closures WHERE closure_month >= $1 AND closure_month <= $2`
        : `SELECT COUNT(*) AS monthly_closure_count, COALESCE(SUM(ticket_count), 0) AS ticket_count, COALESCE(SUM(total_amount), 0) AS total_amount, COALESCE(SUM(total_ht), 0) AS total_ht, COALESCE(SUM(total_tva), 0) AS total_tva FROM ${prefix}monthly_closures WHERE closure_month >= ? AND closure_month <= ?`;

    const [rows] = await connection.execute(query, [yearStart, yearEnd]);
    const r = (rows as Record<string, number | string>[])[0];
    return {
        monthly_closure_count: Number(r.monthly_closure_count) || 0,
        ticket_count: Number(r.ticket_count) || 0,
        total_amount: Number(r.total_amount) || 0,
        total_ht: Number(r.total_ht) || 0,
        total_tva: Number(r.total_tva) || 0,
    };
}

async function getLatestMonthlyClosureHash(connection: DbConnection): Promise<string | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const [rows] = await connection.execute(
        `SELECT closure_hash FROM ${prefix}monthly_closures ORDER BY id DESC LIMIT 1`
    );
    return (rows as { closure_hash: string | null }[])[0]?.closure_hash ?? null;
}

async function getLatestAnnualClosureHash(connection: DbConnection): Promise<string | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const [rows] = await connection.execute(
        `SELECT closure_hash FROM ${prefix}annual_closures ORDER BY id DESC LIMIT 1`
    );
    return (rows as { closure_hash: string | null }[])[0]?.closure_hash ?? null;
}

function generateClosureHash(period: string, totals: PeriodTotals, previousHash: string | null): string {
    const data = [
        previousHash || '',
        period,
        totals.ticket_count,
        totals.total_amount,
        totals.total_ht,
        totals.total_tva,
        totals.daily_closure_count ?? totals.monthly_closure_count ?? 0,
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const body = (await request.json()) as {
            type: 'monthly' | 'annual';
            year: number;
            month?: number;
            closed_by: string;
        };

        if (!body.type || !body.year || !body.closed_by) {
            return NextResponse.json({ error: 'type, year, and closed_by are required' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        await connection.beginTransaction();

        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        if (body.type === 'monthly') {
            if (!body.month) {
                await connection.rollback();
                return NextResponse.json({ error: 'month is required for monthly closure' }, { status: 400 });
            }

            const monthDate = `${body.year}-${String(body.month).padStart(2, '0')}-01`;

            // Check if already exists
            const [existing] = await connection.execute(
                isPg
                    ? `SELECT id FROM ${prefix}monthly_closures WHERE closure_month = $1`
                    : `SELECT id FROM ${prefix}monthly_closures WHERE closure_month = ?`,
                [monthDate]
            );
            if ((existing as { id: number }[]).length > 0) {
                await connection.rollback();
                return NextResponse.json({ error: 'Monthly closure already exists' }, { status: 409 });
            }

            const totals = await aggregateMonthlyFromDaily(connection, body.year, body.month);
            const previousHash = await getLatestMonthlyClosureHash(connection);
            const closureHash = generateClosureHash(monthDate, totals, previousHash);

            const insertQuery = isPg
                ? `INSERT INTO ${prefix}monthly_closures (closure_month, daily_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash, closed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
                : `INSERT INTO ${prefix}monthly_closures (closure_month, daily_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash, closed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            await connection.execute(insertQuery, [
                monthDate,
                totals.daily_closure_count ?? 0,
                totals.ticket_count,
                totals.total_amount,
                totals.total_ht,
                totals.total_tva,
                closureHash,
                previousHash,
                body.closed_by,
            ]);

            await insertAuditEvent(connection, {
                event_type: 'monthly_closure',
                entity_type: 'monthly_closure',
                entity_id: monthDate,
                user_name: body.closed_by,
                detail: `tickets=${totals.ticket_count} total=${totals.total_amount} hash=${closureHash.slice(0, 16)}...`,
            });

            await connection.commit();
            return NextResponse.json(
                {
                    success: true,
                    closure: {
                        month: monthDate,
                        ...totals,
                        closure_hash: closureHash,
                        previous_closure_hash: previousHash,
                    },
                },
                { status: 200 }
            );
        } else {
            // Annual closure
            const yearStr = String(body.year);

            const [existing] = await connection.execute(
                isPg
                    ? `SELECT id FROM ${prefix}annual_closures WHERE closure_year = $1`
                    : `SELECT id FROM ${prefix}annual_closures WHERE closure_year = ?`,
                [body.year]
            );
            if ((existing as { id: number }[]).length > 0) {
                await connection.rollback();
                return NextResponse.json({ error: 'Annual closure already exists' }, { status: 409 });
            }

            const totals = await aggregateAnnualFromMonthly(connection, body.year);
            const previousHash = await getLatestAnnualClosureHash(connection);
            const closureHash = generateClosureHash(yearStr, totals, previousHash);

            const insertQuery = isPg
                ? `INSERT INTO ${prefix}annual_closures (closure_year, monthly_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash, closed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
                : `INSERT INTO ${prefix}annual_closures (closure_year, monthly_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash, closed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            await connection.execute(insertQuery, [
                body.year,
                totals.monthly_closure_count ?? 0,
                totals.ticket_count,
                totals.total_amount,
                totals.total_ht,
                totals.total_tva,
                closureHash,
                previousHash,
                body.closed_by,
            ]);

            await insertAuditEvent(connection, {
                event_type: 'annual_closure',
                entity_type: 'annual_closure',
                entity_id: yearStr,
                user_name: body.closed_by,
                detail: `tickets=${totals.ticket_count} total=${totals.total_amount} hash=${closureHash.slice(0, 16)}...`,
            });

            await connection.commit();
            return NextResponse.json(
                {
                    success: true,
                    closure: {
                        year: body.year,
                        ...totals,
                        closure_hash: closureHash,
                        previous_closure_hash: previousHash,
                    },
                },
                { status: 200 }
            );
        }
    } catch (error) {
        await connection?.rollback();
        console.error('Error creating period closure:', error);
        return NextResponse.json({ error: 'An error occurred while creating period closure' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'monthly';
        const limit = Math.min(parseInt(searchParams.get('limit') || '12', 10), 120);

        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        if (type === 'annual') {
            const [rows] = await connection.execute(
                `SELECT * FROM ${prefix}annual_closures ORDER BY closure_year DESC LIMIT ${isPg ? '$1' : '?'}`,
                [limit]
            );
            return NextResponse.json({ closures: rows }, { status: 200 });
        } else {
            const [rows] = await connection.execute(
                `SELECT * FROM ${prefix}monthly_closures ORDER BY closure_month DESC LIMIT ${isPg ? '$1' : '?'}`,
                [limit]
            );
            return NextResponse.json({ closures: rows }, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching period closures:', error);
        return NextResponse.json({ error: 'An error occurred while fetching period closures' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
